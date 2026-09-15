import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public (publishable) configuration is injected by the static host at
// /config.js from environment variables. No secrets live in this file.
const cfg = window.ERP_CONFIG || {};
const SCHEMA = cfg.DATABASE_SCHEMA || "t350_v3";
const supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
  db: { schema: SCHEMA },
});

// Full ERP module structure, reconciled from the legacy module register
// (artifacts/m-t350-v3-legacy-module-register.json).
const MODULES = [
  { group: "Catalog", id: "catalog", route: "/catalog", table: "products", roles: ["master", "operations", "sales"] },
  { group: "Catalog", id: "warehouses", route: "/warehouses", table: "warehouses", roles: ["master", "operations"] },
  { group: "Catalog", id: "stock-ledger", route: "/inventory", table: "inventory_movements", roles: ["master", "operations"] },
  { group: "Purchasing", id: "purchase-orders", route: "/purchasing/orders", table: "purchase_orders", roles: ["master", "purchasing"] },
  { group: "Purchasing", id: "suppliers", route: "/purchasing/suppliers", table: "suppliers", roles: ["master", "purchasing"] },
  { group: "Purchasing", id: "receiving", route: "/purchasing/receipts", table: "goods_receipts", roles: ["master", "purchasing", "operations"] },
  { group: "Sales", id: "sales-orders", route: "/sales/orders", table: "sales_orders", roles: ["master", "sales"] },
  { group: "Sales", id: "customers", route: "/sales/customers", table: "customers", roles: ["master", "sales"] },
  { group: "Finance", id: "invoices", route: "/finance/invoices", table: "invoices", roles: ["master", "finance"] },
  { group: "Finance", id: "payments", route: "/finance/payments", table: "payments", roles: ["master", "finance"] },
  { group: "Finance", id: "chart-of-accounts", route: "/finance/accounts", table: "chart_of_accounts", roles: ["master", "finance"] },
  { group: "Finance", id: "expenses", route: "/finance/expenses", table: "expenses", roles: ["master", "finance"] },
  { group: "Projects", id: "projects", route: "/projects", table: "projects", roles: ["master", "operations", "sales"] },
  { group: "Projects", id: "project-tasks", route: "/projects/tasks", table: "project_tasks", roles: ["master", "operations"] },
  { group: "CRM", id: "crm-leads", route: "/crm/leads", table: "leads", roles: ["master", "sales"] },
  { group: "CRM", id: "crm-activities", route: "/crm/activities", table: "crm_activities", roles: ["master", "sales"] },
  { group: "HR", id: "employees", route: "/hr/employees", table: "employees", roles: ["master", "hr"] },
  { group: "HR", id: "leave", route: "/hr/leave", table: "leave_requests", roles: ["master", "hr"] },
  { group: "HR", id: "payroll", route: "/hr/payroll", table: "payroll_runs", roles: ["master", "hr"] },
  { group: "HR", id: "timesheets", route: "/hr/timesheets", table: "timesheets", roles: ["master", "hr", "operations"] },
  { group: "Admin", id: "users", route: "/admin/users", table: "profiles", roles: ["master"], admin: true },
  { group: "Admin", id: "roles", route: "/admin/roles", table: "user_roles", roles: ["master"] },
  { group: "Admin", id: "audit", route: "/admin/audit", table: "audit_log", roles: ["master"] },
  { group: "Admin", id: "settings", route: "/admin/settings", table: "tenant_settings", roles: ["master"] },
];

const els = {
  navLinks: document.getElementById("nav-links"),
  sessionUser: document.getElementById("session-user"),
  signOut: document.getElementById("sign-out"),
  loginSection: document.getElementById("section-login"),
  loginForm: document.getElementById("login-form"),
  loginError: document.getElementById("login-error"),
  moduleSection: document.getElementById("section-module"),
  moduleHeading: document.getElementById("module-heading"),
  moduleContent: document.getElementById("module-content"),
  moduleAdmin: document.getElementById("module-admin"),
  adminForm: document.getElementById("admin-form"),
  adminResult: document.getElementById("admin-result"),
};

let userRoles = [];

function renderNav() {
  els.navLinks.innerHTML = "";
  let lastGroup = null;
  for (const mod of MODULES) {
    if (!mod.roles.some((r) => userRoles.includes(r))) continue;
    if (mod.group !== lastGroup) {
      const g = document.createElement("span");
      g.className = "nav-group";
      g.textContent = mod.group;
      els.navLinks.appendChild(g);
      lastGroup = mod.group;
    }
    const a = document.createElement("a");
    a.href = "#" + mod.route;
    a.textContent = mod.id;
    a.dataset.module = mod.id;
    els.navLinks.appendChild(a);
  }
}

async function loadRoles() {
  // Members may always read their own role rows (RLS: user_roles_select_own).
  const { data, error } = await supabase.from("user_roles").select("role");
  if (error) {
    console.error("role load failed", error);
    userRoles = [];
    return;
  }
  userRoles = (data || []).map((r) => r.role);
}

function routeModule() {
  const hash = location.hash.replace(/^#/, "") || "/catalog";
  return MODULES.find((m) => m.route === hash) || MODULES[0];
}

async function renderModule() {
  const mod = routeModule();
  if (!mod.roles.some((r) => userRoles.includes(r))) {
    els.moduleHeading.textContent = "Access restricted";
    els.moduleContent.innerHTML = "<p class='muted'>Your roles do not grant access to this module.</p>";
    els.moduleAdmin.hidden = true;
    return;
  }
  for (const a of els.navLinks.querySelectorAll("a")) {
    a.classList.toggle("active", a.dataset.module === mod.id);
  }
  els.moduleHeading.textContent = `${mod.group} / ${mod.id} (${mod.table})`;
  els.moduleAdmin.hidden = !mod.admin;
  els.moduleContent.innerHTML = "<p class='muted'>Loading…</p>";

  const { data, error } = await supabase.from(mod.table).select("*").limit(200);
  if (error) {
    els.moduleContent.innerHTML = `<p class="error">${error.message}</p>`;
    return;
  }
  if (!data || data.length === 0) {
    els.moduleContent.innerHTML = "<p class='muted'>No rows yet.</p>";
    return;
  }
  const cols = Object.keys(data[0]);
  const thead = "<tr>" + cols.map((c) => `<th>${c}</th>`).join("") + "</tr>";
  const rows = data
    .map(
      (row) =>
        "<tr>" +
        cols
          .map((c) => {
            const v = row[c];
            return `<td>${v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v)}</td>`;
          })
          .join("") +
        "</tr>"
    )
    .join("");
  els.moduleContent.innerHTML = `<table>${thead}${rows}</table>`;
}

async function refreshSession() {
  const { data: { session } } = await supabase.auth.getSession();
  const signedIn = Boolean(session);
  els.loginSection.hidden = signedIn;
  els.moduleSection.hidden = !signedIn;
  els.signOut.hidden = !signedIn;
  els.sessionUser.textContent = signedIn ? `${session.user.email} (${userRoles.join(", ") || "no roles"})` : "";
  if (signedIn) {
    await loadRoles();
    renderNav();
    await renderModule();
    els.sessionUser.textContent = `${session.user.email} (${userRoles.join(", ") || "no roles"})`;
  } else {
    els.navLinks.innerHTML = "";
  }
}

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.loginError.textContent = "";
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) els.loginError.textContent = error.message;
});

els.signOut.addEventListener("click", async () => {
  await supabase.auth.signOut();
});

els.adminForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.adminResult.textContent = "Submitting…";
  const body = {
    action: document.getElementById("admin-action").value,
    user_id: document.getElementById("admin-user-id").value || undefined,
    email: document.getElementById("admin-email").value || undefined,
    password: document.getElementById("admin-password").value || undefined,
    full_name: document.getElementById("admin-full-name").value || undefined,
    role: document.getElementById("admin-role").value || undefined,
  };
  // Account administration goes through the edge function only; the browser
  // never mutates profiles/user_roles directly.
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  els.adminResult.textContent = error
    ? `Error: ${error.message}`
    : `OK: ${JSON.stringify(data)}`;
  await renderModule();
});

window.addEventListener("hashchange", renderModule);
supabase.auth.onAuthStateChange(() => refreshSession());
refreshSession();
