-- M-T350-V3 restoration: row-level security.
-- Role matrix reconciled from the legacy module register; HR restrictions
-- per the 2026-09-01 operations-trail note (employees/leave/payroll are
-- master+hr only; operations may VIEW submitted timesheets but can never
-- approve them or touch payroll).

-- -------------------------------------------------------------------------
-- Helper functions (security definer so role checks don't recurse into RLS)
-- -------------------------------------------------------------------------
create or replace function t350_v3.has_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = t350_v3
as $$
  select exists (
    select 1
    from t350_v3.user_roles ur
    join t350_v3.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid()
      and ur.role = p_role
      and p.is_active
  );
$$;

create or replace function t350_v3.has_any_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = t350_v3
as $$
  select exists (
    select 1
    from t350_v3.user_roles ur
    join t350_v3.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid()
      and ur.role = any (p_roles)
      and p.is_active
  );
$$;

create or replace function t350_v3.is_master()
returns boolean
language sql
stable
security definer
set search_path = t350_v3
as $$
  select t350_v3.has_role('master');
$$;

-- -------------------------------------------------------------------------
-- Enable RLS on every ERP table
-- -------------------------------------------------------------------------
alter table t350_v3.profiles enable row level security;
alter table t350_v3.user_roles enable row level security;
alter table t350_v3.audit_log enable row level security;
alter table t350_v3.tenant_settings enable row level security;
alter table t350_v3.products enable row level security;
alter table t350_v3.warehouses enable row level security;
alter table t350_v3.inventory_movements enable row level security;
alter table t350_v3.suppliers enable row level security;
alter table t350_v3.purchase_orders enable row level security;
alter table t350_v3.goods_receipts enable row level security;
alter table t350_v3.customers enable row level security;
alter table t350_v3.sales_orders enable row level security;
alter table t350_v3.leads enable row level security;
alter table t350_v3.crm_activities enable row level security;
alter table t350_v3.chart_of_accounts enable row level security;
alter table t350_v3.invoices enable row level security;
alter table t350_v3.payments enable row level security;
alter table t350_v3.expenses enable row level security;
alter table t350_v3.projects enable row level security;
alter table t350_v3.project_tasks enable row level security;
alter table t350_v3.employees enable row level security;
alter table t350_v3.leave_requests enable row level security;
alter table t350_v3.payroll_runs enable row level security;
alter table t350_v3.timesheets enable row level security;

-- -------------------------------------------------------------------------
-- Administration tables. Account mutation is edge-function only, so there
-- are deliberately NO client insert/update/delete policies on profiles or
-- user_roles.
-- -------------------------------------------------------------------------
create policy profiles_select on t350_v3.profiles
  for select to authenticated
  using (id = auth.uid() or t350_v3.is_master());

create policy user_roles_select_own on t350_v3.user_roles
  for select to authenticated
  using (user_id = auth.uid());

create policy user_roles_select_master on t350_v3.user_roles
  for select to authenticated
  using (t350_v3.is_master());

create policy audit_log_select on t350_v3.audit_log
  for select to authenticated
  using (t350_v3.is_master());

create policy audit_log_insert on t350_v3.audit_log
  for insert to authenticated
  with check (actor = auth.uid() or actor is null);
-- No update/delete policies on audit_log: append-only (also enforced by trigger).

create policy tenant_settings_master on t350_v3.tenant_settings
  for all to authenticated
  using (t350_v3.is_master())
  with check (t350_v3.is_master());

-- -------------------------------------------------------------------------
-- Catalog / inventory: master, operations, sales (read)
-- -------------------------------------------------------------------------
create policy products_select on t350_v3.products
  for select to authenticated
  using (t350_v3.has_any_role(array['master','operations','sales']));
create policy products_write on t350_v3.products
  for all to authenticated
  using (t350_v3.has_any_role(array['master','operations']))
  with check (t350_v3.has_any_role(array['master','operations']));

create policy warehouses_select on t350_v3.warehouses
  for select to authenticated
  using (t350_v3.has_any_role(array['master','operations']));
create policy warehouses_write on t350_v3.warehouses
  for all to authenticated
  using (t350_v3.has_any_role(array['master','operations']))
  with check (t350_v3.has_any_role(array['master','operations']));

create policy inventory_movements_select on t350_v3.inventory_movements
  for select to authenticated
  using (t350_v3.has_any_role(array['master','operations']));
create policy inventory_movements_write on t350_v3.inventory_movements
  for all to authenticated
  using (t350_v3.has_any_role(array['master','operations']))
  with check (t350_v3.has_any_role(array['master','operations']));

-- -------------------------------------------------------------------------
-- Purchasing
-- -------------------------------------------------------------------------
create policy purchase_orders_select on t350_v3.purchase_orders
  for select to authenticated
  using (t350_v3.has_any_role(array['master','purchasing']));
create policy purchase_orders_write on t350_v3.purchase_orders
  for all to authenticated
  using (t350_v3.has_any_role(array['master','purchasing']))
  with check (t350_v3.has_any_role(array['master','purchasing']));

create policy suppliers_select on t350_v3.suppliers
  for select to authenticated
  using (t350_v3.has_any_role(array['master','purchasing']));
create policy suppliers_write on t350_v3.suppliers
  for all to authenticated
  using (t350_v3.has_any_role(array['master','purchasing']))
  with check (t350_v3.has_any_role(array['master','purchasing']));

create policy goods_receipts_select on t350_v3.goods_receipts
  for select to authenticated
  using (t350_v3.has_any_role(array['master','purchasing','operations']));
create policy goods_receipts_write on t350_v3.goods_receipts
  for all to authenticated
  using (t350_v3.has_any_role(array['master','purchasing','operations']))
  with check (t350_v3.has_any_role(array['master','purchasing','operations']));

-- -------------------------------------------------------------------------
-- Sales / CRM
-- -------------------------------------------------------------------------
create policy sales_orders_select on t350_v3.sales_orders
  for select to authenticated
  using (t350_v3.has_any_role(array['master','sales']));
create policy sales_orders_write on t350_v3.sales_orders
  for all to authenticated
  using (t350_v3.has_any_role(array['master','sales']))
  with check (t350_v3.has_any_role(array['master','sales']));

create policy customers_select on t350_v3.customers
  for select to authenticated
  using (t350_v3.has_any_role(array['master','sales']));
create policy customers_write on t350_v3.customers
  for all to authenticated
  using (t350_v3.has_any_role(array['master','sales']))
  with check (t350_v3.has_any_role(array['master','sales']));

create policy leads_select on t350_v3.leads
  for select to authenticated
  using (t350_v3.has_any_role(array['master','sales']));
create policy leads_write on t350_v3.leads
  for all to authenticated
  using (t350_v3.has_any_role(array['master','sales']))
  with check (t350_v3.has_any_role(array['master','sales']));

create policy crm_activities_select on t350_v3.crm_activities
  for select to authenticated
  using (t350_v3.has_any_role(array['master','sales']));
create policy crm_activities_write on t350_v3.crm_activities
  for all to authenticated
  using (t350_v3.has_any_role(array['master','sales']))
  with check (t350_v3.has_any_role(array['master','sales']));

-- -------------------------------------------------------------------------
-- Finance
-- -------------------------------------------------------------------------
create policy chart_of_accounts_select on t350_v3.chart_of_accounts
  for select to authenticated
  using (t350_v3.has_any_role(array['master','finance']));
create policy chart_of_accounts_write on t350_v3.chart_of_accounts
  for all to authenticated
  using (t350_v3.has_any_role(array['master','finance']))
  with check (t350_v3.has_any_role(array['master','finance']));

create policy invoices_select on t350_v3.invoices
  for select to authenticated
  using (t350_v3.has_any_role(array['master','finance']));
create policy invoices_write on t350_v3.invoices
  for all to authenticated
  using (t350_v3.has_any_role(array['master','finance']))
  with check (t350_v3.has_any_role(array['master','finance']));

create policy payments_select on t350_v3.payments
  for select to authenticated
  using (t350_v3.has_any_role(array['master','finance']));
create policy payments_write on t350_v3.payments
  for all to authenticated
  using (t350_v3.has_any_role(array['master','finance']))
  with check (t350_v3.has_any_role(array['master','finance']));

create policy expenses_select on t350_v3.expenses
  for select to authenticated
  using (t350_v3.has_any_role(array['master','finance']));
create policy expenses_write on t350_v3.expenses
  for all to authenticated
  using (t350_v3.has_any_role(array['master','finance']))
  with check (t350_v3.has_any_role(array['master','finance']));

-- -------------------------------------------------------------------------
-- Projects
-- -------------------------------------------------------------------------
create policy projects_select on t350_v3.projects
  for select to authenticated
  using (t350_v3.has_any_role(array['master','operations','sales']));
create policy projects_write on t350_v3.projects
  for all to authenticated
  using (t350_v3.has_any_role(array['master','operations']))
  with check (t350_v3.has_any_role(array['master','operations']));

create policy project_tasks_select on t350_v3.project_tasks
  for select to authenticated
  using (t350_v3.has_any_role(array['master','operations']));
create policy project_tasks_write on t350_v3.project_tasks
  for all to authenticated
  using (t350_v3.has_any_role(array['master','operations']))
  with check (t350_v3.has_any_role(array['master','operations']));

-- -------------------------------------------------------------------------
-- HR: restricted to master + hr. Operations may VIEW submitted timesheets
-- only, and can never approve timesheets or touch payroll.
-- -------------------------------------------------------------------------
create policy employees_select on t350_v3.employees
  for select to authenticated
  using (t350_v3.has_any_role(array['master','hr']));
create policy employees_write on t350_v3.employees
  for all to authenticated
  using (t350_v3.has_any_role(array['master','hr']))
  with check (t350_v3.has_any_role(array['master','hr']));

create policy leave_requests_select on t350_v3.leave_requests
  for select to authenticated
  using (t350_v3.has_any_role(array['master','hr']));
create policy leave_requests_write on t350_v3.leave_requests
  for all to authenticated
  using (t350_v3.has_any_role(array['master','hr']))
  with check (t350_v3.has_any_role(array['master','hr']));

-- payroll_runs: read-only for master/hr; never direct-client writable
-- (no insert/update/delete policies on purpose).
create policy payroll_runs_select on t350_v3.payroll_runs
  for select to authenticated
  using (t350_v3.has_any_role(array['master','hr']));

create policy timesheets_select on t350_v3.timesheets
  for select to authenticated
  using (
    t350_v3.has_any_role(array['master','hr'])
    or (t350_v3.has_role('operations') and status = 'submitted')
  );
create policy timesheets_insert on t350_v3.timesheets
  for insert to authenticated
  with check (t350_v3.has_any_role(array['master','hr']));
create policy timesheets_update on t350_v3.timesheets
  for update to authenticated
  using (t350_v3.has_any_role(array['master','hr']))
  with check (t350_v3.has_any_role(array['master','hr']));
create policy timesheets_delete on t350_v3.timesheets
  for delete to authenticated
  using (t350_v3.has_any_role(array['master','hr']));
