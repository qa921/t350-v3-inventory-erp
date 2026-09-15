// T350-V3 admin-users edge function.
//
// Sole channel for account administration (create user, grant/revoke role,
// deactivate, delete). Direct browser mutation of profiles/user_roles is
// forbidden by RLS; all mutations run here with the service role.
//
// Auth model: the caller's JWT is verified in-code (auth.getUser) and the
// caller must be an ACTIVE master. Gateway JWT verification is disabled on
// purpose so browser CORS preflights from the Render origin succeed; every
// code path below still requires a verified master session.
//
// The final-active-master guard is enforced twice: here (clean 409) and in
// the database via the guard_final_active_master trigger (atomic failure
// plus audit event), so direct SQL/service-role paths are covered too.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SCHEMA = Deno.env.get("ERP_SCHEMA") ?? "t350_v3";

const VALID_ROLES = new Set(["master", "operations", "sales", "purchasing", "finance", "hr"]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  // Verify the caller in their own (RLS-constrained) context first.
  const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: SCHEMA },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await caller.auth.getUser();
  const actor = userData?.user;
  if (userError || !actor) return json({ error: "unauthorized" }, 401);

  // Privileged client for administration. Never exposed to the browser.
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: SCHEMA },
  });

  const { data: actorProfile } = await admin
    .from("profiles").select("id, is_active").eq("id", actor.id).maybeSingle();
  const { data: actorRoles } = await admin
    .from("user_roles").select("role").eq("user_id", actor.id);
  const actorIsMaster =
    Boolean(actorProfile?.is_active) && (actorRoles ?? []).some((r) => r.role === "master");
  if (!actorIsMaster) {
    return json({ error: "forbidden", detail: "active master role required" }, 403);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const action = String(payload.action ?? "");

  const audit = async (actionName: string, entityId: string | null, detail: Record<string, unknown>) => {
    await admin.from("audit_log").insert({
      actor: actor.id,
      action: actionName,
      entity: "account",
      entity_id: entityId,
      detail,
    });
  };

  const activeMasterIds = async (): Promise<string[]> => {
    const { data: masters } = await admin.from("user_roles").select("user_id").eq("role", "master");
    const ids = (masters ?? []).map((m) => m.user_id as string);
    if (ids.length === 0) return [];
    const { data: active } = await admin.from("profiles").select("id").in("id", ids).eq("is_active", true);
    return (active ?? []).map((p) => p.id as string);
  };

  // Returns true (and audits) when the operation must be blocked.
  const guardFinalMaster = async (targetId: string, attempted: string): Promise<boolean> => {
    const masters = await activeMasterIds();
    if (masters.includes(targetId) && masters.length === 1) {
      await audit("final_active_master_guard_blocked", targetId, { attempted });
      return true;
    }
    return false;
  };

  const targetId = typeof payload.user_id === "string" ? payload.user_id : null;

  switch (action) {
    case "create_user": {
      const email = String(payload.email ?? "");
      const password = String(payload.password ?? "");
      const fullName = typeof payload.full_name === "string" ? payload.full_name : null;
      const role = typeof payload.role === "string" ? payload.role : null;
      if (!email || !password) return json({ error: "email_and_password_required" }, 400);
      if (role && !VALID_ROLES.has(role)) return json({ error: "invalid_role" }, 400);

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (createError || !created.user) {
        return json({ error: "create_failed", detail: createError?.message }, 400);
      }
      await admin.from("profiles").upsert({ id: created.user.id, email, full_name: fullName, is_active: true });
      if (role) {
        await admin.from("user_roles").upsert({ user_id: created.user.id, role, granted_by: actor.id });
      }
      await audit("account_created", created.user.id, { email, role });
      return json({ ok: true, user_id: created.user.id });
    }

    case "set_role": {
      const role = String(payload.role ?? "");
      if (!targetId || !VALID_ROLES.has(role)) return json({ error: "user_id_and_valid_role_required" }, 400);
      const { error } = await admin.from("user_roles").upsert({ user_id: targetId, role, granted_by: actor.id });
      if (error) return json({ error: "role_grant_failed", detail: error.message }, 400);
      await audit("role_granted", targetId, { role });
      return json({ ok: true });
    }

    case "remove_role": {
      const role = String(payload.role ?? "");
      if (!targetId || !VALID_ROLES.has(role)) return json({ error: "user_id_and_valid_role_required" }, 400);
      if (role === "master" && (await guardFinalMaster(targetId, action))) {
        return json({ error: "final_active_master", detail: "cannot remove the final active master user" }, 409);
      }
      const { error } = await admin.from("user_roles").delete().eq("user_id", targetId).eq("role", role);
      if (error) return json({ error: "role_revoke_failed", detail: error.message }, 400);
      await audit("role_revoked", targetId, { role });
      return json({ ok: true });
    }

    case "deactivate_user": {
      if (!targetId) return json({ error: "user_id_required" }, 400);
      if (await guardFinalMaster(targetId, action)) {
        return json({ error: "final_active_master", detail: "cannot deactivate the final active master user" }, 409);
      }
      const { error } = await admin.from("profiles").update({ is_active: false }).eq("id", targetId);
      if (error) return json({ error: "deactivate_failed", detail: error.message }, 400);
      await audit("account_deactivated", targetId, {});
      return json({ ok: true });
    }

    case "reactivate_user": {
      if (!targetId) return json({ error: "user_id_required" }, 400);
      const { error } = await admin.from("profiles").update({ is_active: true }).eq("id", targetId);
      if (error) return json({ error: "reactivate_failed", detail: error.message }, 400);
      await audit("account_reactivated", targetId, {});
      return json({ ok: true });
    }

    case "delete_user": {
      if (!targetId) return json({ error: "user_id_required" }, 400);
      if (await guardFinalMaster(targetId, action)) {
        return json({ error: "final_active_master", detail: "cannot delete the final active master user" }, 409);
      }
      // The DB-level guard trigger also fires on the cascading profile delete.
      const { error } = await admin.auth.admin.deleteUser(targetId);
      if (error) return json({ error: "delete_failed", detail: error.message }, 400);
      await audit("account_deleted", targetId, {});
      return json({ ok: true });
    }

    default:
      return json({ error: "unknown_action", detail: action }, 400);
  }
});
