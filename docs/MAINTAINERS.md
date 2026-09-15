# Maintainer notes — T350-V3 Inventory ERP

Credential-free ownership map. No secrets, API keys, or connection strings
belong in this file or anywhere in the repository; reference where a value
lives, never the value itself.

## Code (this repository)

- `web/` — the restored ERP browser client (static; no build step). It talks
  directly to Supabase with the **publishable/anon key only** and is fully
  constrained by RLS. Module structure in `web/app.js` mirrors
  `artifacts/m-t350-v3-legacy-module-register.json`.
- `app.py` — the static host. Serves `web/` and exposes only public config
  (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `DATABASE_SCHEMA`) at `/config.js`
  from environment variables.
- `src/`, `data/`, `config/`, `artifacts/`, `tests/` — legacy inventory
  fixture sources and the pre-recovery register/operations trail. The
  artifacts are reconciliation evidence, not an implementation plan.
- `supabase/migrations/` — tracked database migrations (apply in filename
  order).
- `supabase/functions/admin-users/` — account-administration edge function
  source.

## Database (Supabase)

- Project: the Supabase project referenced by `SUPABASE_URL` in the Render
  service environment. All ERP objects live in the dedicated **`t350_v3`**
  schema (the `public` schema hosts unrelated fixtures — do not mix them).
- The schema is exposed to the REST API via the project's PostgREST
  `db_schema` setting, which must include `t350_v3` alongside `public`.
- Schema, constraints, RLS policies, and the safety guards are owned by the
  migrations in `supabase/migrations/`; every change must be a new tracked
  migration, never a dashboard edit.
- RLS summary: `employees`, `leave_requests`, `payroll_runs` are master+hr
  only; `payroll_runs` is never direct-client writable; `operations` may
  view submitted `timesheets` but cannot approve them or touch payroll;
  `audit_log` is append-only (trigger-enforced); `profiles`/`user_roles`
  have no client write policies.

## Edge administration (Supabase Edge Functions)

- The `admin-users` function is the **only** channel for account mutation
  (create user, grant/revoke role, deactivate, delete). It verifies the
  caller's JWT in code and requires an active master.
- The final-active-master guard is enforced in the function (HTTP 409) and
  again in the database by `guard_final_active_master` triggers, which fail
  atomically and write an audit event — this also covers direct SQL and
  service-role paths.
- The function uses the service-role key, which is injected by the Supabase
  runtime (`SUPABASE_SERVICE_ROLE_KEY`) and must never be copied into the
  repo, the browser client, or Render.

## Hosting (Render)

- Live service: **`t350-v3-inventory-erp`** (static content served by the
  Python host above). Build: `python -m compileall app.py`; start:
  `python app.py`.
- Environment: only public values — `SUPABASE_URL`, `SUPABASE_ANON_KEY`
  (publishable anon key), `DATABASE_SCHEMA=t350_v3`. No database connection
  strings or service keys are set on this service.
- Auth (Supabase project Auth config): public signup disabled; site URL and
  redirect allow-list restricted to the live Render URL
  (`https://t350-v3-inventory-erp.onrender.com`) only.

## V3/V4 reconciliation record

The accessible Supabase Auth configuration and the previously deployed
Render service (`t350-v4-projects-erp`) pointed at the V4 line, while the
recoverable source of truth is this V3 repository. V4's repository and
service contain only a placeholder and were not extended. Hosting and Auth
were deliberately re-anchored to the V3 repository/service; treat
`t350-v4-projects-erp` as legacy-only and do not add features to it.
