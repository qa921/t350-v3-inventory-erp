# T350-V3 Inventory ERP

Restored ERP built from the legacy module register and operations trail in
`artifacts/`. The browser client (`web/`) talks directly to Supabase under
row-level security; account administration runs exclusively through the
`admin-users` edge function; hosting is the Render static-host service
`t350-v3-inventory-erp`.

## Layout

- `web/` — ERP browser client (static, no build step; full module set per the register).
- `app.py` — static host; serves `web/` and public runtime config at `/config.js`.
- `supabase/migrations/` — tracked schema/RLS/guard migrations (schema `t350_v3`).
- `supabase/functions/admin-users/` — edge function owning all account mutation.
- `src/`, `data/`, `config/`, `tests/` — legacy inventory fixture sources (preserved).
- `artifacts/` — pre-recovery source facts (register + operations trail); reconciliation evidence.
- `docs/MAINTAINERS.md` — credential-free ownership map for code, database
  rules, edge administration, and hosting. Read it before changing anything.

## Legacy fixture note

Inputs still live in `data/`, shared rules in `config/`, and untrusted/stale
prior-state artifacts in `artifacts/`. Canonical product IDs are `P-1001`
through `P-1025`. Dates are ISO dates; quantities are units; currency is USD
unless a listing specifies otherwise.
