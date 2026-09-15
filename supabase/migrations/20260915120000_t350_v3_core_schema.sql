-- M-T350-V3 restoration: core ERP schema.
-- All ERP objects live in the dedicated t350_v3 schema (the project database
-- hosts other, unrelated fixtures in public). Reconciles the table set named
-- in artifacts/m-t350-v3-legacy-module-register.json.

create schema if not exists t350_v3;

-- -------------------------------------------------------------------------
-- Identity / administration
-- -------------------------------------------------------------------------
create table if not exists t350_v3.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists t350_v3.user_roles (
  user_id uuid not null references t350_v3.profiles (id) on delete cascade,
  role text not null check (role in ('master','operations','sales','purchasing','finance','hr')),
  granted_by uuid,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table if not exists t350_v3.audit_log (
  id bigint generated always as identity primary key,
  actor uuid,
  action text not null,
  entity text not null,
  entity_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists t350_v3.tenant_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- -------------------------------------------------------------------------
-- Catalog / inventory
-- -------------------------------------------------------------------------
create table if not exists t350_v3.products (
  id text primary key, -- canonical product IDs P-1001..P-1025
  sku text not null unique,
  name text not null,
  unit text not null default 'unit',
  unit_cost numeric(12,2) not null default 0,
  list_price numeric(12,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists t350_v3.warehouses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  location text,
  is_active boolean not null default true
);

create table if not exists t350_v3.inventory_movements (
  id bigint generated always as identity primary key,
  product_id text not null references t350_v3.products (id),
  warehouse_id uuid not null references t350_v3.warehouses (id),
  quantity integer not null,
  movement_type text not null check (movement_type in ('receipt','issue','adjustment','transfer')),
  reference text,
  created_by uuid,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------------------
-- Purchasing
-- -------------------------------------------------------------------------
create table if not exists t350_v3.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_email text,
  phone text,
  is_active boolean not null default true
);

create table if not exists t350_v3.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references t350_v3.suppliers (id),
  status text not null default 'draft' check (status in ('draft','submitted','received','cancelled')),
  order_date date not null default current_date,
  expected_date date,
  total numeric(14,2) not null default 0,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists t350_v3.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references t350_v3.purchase_orders (id),
  received_date date not null default current_date,
  received_by uuid,
  note text
);

-- -------------------------------------------------------------------------
-- Sales / CRM
-- -------------------------------------------------------------------------
create table if not exists t350_v3.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  is_active boolean not null default true
);

create table if not exists t350_v3.sales_orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references t350_v3.customers (id),
  status text not null default 'draft' check (status in ('draft','confirmed','fulfilled','cancelled')),
  order_date date not null default current_date,
  channel text,
  total numeric(14,2) not null default 0,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists t350_v3.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  source text,
  status text not null default 'new' check (status in ('new','qualified','converted','lost')),
  owner uuid
);

create table if not exists t350_v3.crm_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references t350_v3.leads (id),
  customer_id uuid references t350_v3.customers (id),
  kind text not null default 'note',
  subject text not null,
  due_date date,
  done boolean not null default false,
  owner uuid
);

-- -------------------------------------------------------------------------
-- Finance
-- -------------------------------------------------------------------------
create table if not exists t350_v3.chart_of_accounts (
  code text primary key,
  name text not null,
  type text not null check (type in ('asset','liability','equity','revenue','expense')),
  is_active boolean not null default true
);

create table if not exists t350_v3.invoices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references t350_v3.customers (id),
  number text not null unique,
  status text not null default 'draft' check (status in ('draft','sent','paid','void')),
  issue_date date not null default current_date,
  due_date date,
  total numeric(14,2) not null default 0
);

create table if not exists t350_v3.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references t350_v3.invoices (id),
  paid_date date not null default current_date,
  amount numeric(14,2) not null,
  method text,
  reference text
);

create table if not exists t350_v3.expenses (
  id uuid primary key default gen_random_uuid(),
  account_code text not null references t350_v3.chart_of_accounts (code),
  employee_id uuid,
  amount numeric(14,2) not null,
  expense_date date not null default current_date,
  description text,
  status text not null default 'submitted' check (status in ('submitted','approved','rejected','reimbursed'))
);

-- -------------------------------------------------------------------------
-- Projects
-- -------------------------------------------------------------------------
create table if not exists t350_v3.projects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  status text not null default 'planned' check (status in ('planned','active','on_hold','completed','cancelled')),
  start_date date,
  end_date date,
  manager uuid
);

create table if not exists t350_v3.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references t350_v3.projects (id) on delete cascade,
  title text not null,
  status text not null default 'todo' check (status in ('todo','in_progress','done','blocked')),
  assignee uuid,
  due_date date
);

-- -------------------------------------------------------------------------
-- HR (restricted)
-- -------------------------------------------------------------------------
create table if not exists t350_v3.employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references t350_v3.profiles (id),
  first_name text not null,
  last_name text not null,
  email text,
  department text,
  hire_date date,
  status text not null default 'active' check (status in ('active','on_leave','terminated'))
);

create table if not exists t350_v3.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references t350_v3.employees (id),
  start_date date not null,
  end_date date not null,
  type text not null default 'annual',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by uuid
);

create table if not exists t350_v3.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft','approved','paid')),
  total numeric(14,2) not null default 0,
  approved_by uuid
);

create table if not exists t350_v3.timesheets (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references t350_v3.employees (id),
  work_date date not null,
  hours numeric(5,2) not null,
  project_id uuid references t350_v3.projects (id),
  status text not null default 'draft' check (status in ('draft','submitted','approved')),
  approved_by uuid
);

-- -------------------------------------------------------------------------
-- Grants. RLS (next migration) constrains what these grants actually allow.
-- -------------------------------------------------------------------------
grant usage on schema t350_v3 to anon, authenticated;
grant select on all tables in schema t350_v3 to authenticated;
grant insert, update, delete on
  t350_v3.products, t350_v3.warehouses, t350_v3.inventory_movements,
  t350_v3.suppliers, t350_v3.purchase_orders, t350_v3.goods_receipts,
  t350_v3.customers, t350_v3.sales_orders, t350_v3.leads, t350_v3.crm_activities,
  t350_v3.chart_of_accounts, t350_v3.invoices, t350_v3.payments, t350_v3.expenses,
  t350_v3.projects, t350_v3.project_tasks,
  t350_v3.employees, t350_v3.leave_requests, t350_v3.timesheets,
  t350_v3.tenant_settings
  to authenticated;
-- payroll_runs is intentionally NOT client-writable (HR-only, server-side only).
-- audit_log is append-only: insert allowed (guard/function events), never update/delete.
grant insert on t350_v3.audit_log to authenticated;
