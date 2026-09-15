# M-T350-V3 operations trail (pre-recovery source facts)

This dated trail is evidence for reconciliation, not a deployment checklist or completed design.

| Date | Source | Claim | Known discrepancy / exception |
|---|---|---|---|
| 2026-08-28 | legacy browser ERP handoff | Browser client used Supabase for catalog, inventory, sales, projects, CRM, HR reads, and admin audit views. | No matching client integration remains in this repository. |
| 2026-08-30 | database export notes | Tables named in the module register had RLS enabled. | No task-specific migration appears in accessible applied history. |
| 2026-09-01 | HR access note | HR-only records are employees, leave, payroll; operations may view submitted timesheets but cannot approve payroll. | A prior claim grants operations timesheet approval. |
| 2026-09-03 | master administration note | Create, role-change, deactivate, and deletion requests were sent to a server-side edge function; direct browser mutation was forbidden. | Edge-function source is absent from the V3 tree. |
| 2026-09-04 | account safety note | A request that would delete or deactivate the final active master must fail atomically and write an audit event. | No guard implementation or migration is present. |
| 2026-09-07 | hosting handoff | V3 was expected to be released from the V3 repository after public environment values were set. | Accessible Render service is `t350-v4-projects-erp`, backed by a different repository and Python command. |
| 2026-09-09 | Auth handoff | Public signup must be disabled; site URL and redirect allow-list must use the live Render URL only. | Current accessible project has signup disabled but points to the V4 Render URL. |
| 2026-09-10 | inventory reconciliation | `inventory-snapshot.json` supersedes SKU quantities in `prior-ui-cache.json`; product aliases still need canonical IDs. | Conflicting source dates are intentional recovery inputs. |
| 2026-09-12 | channel reconciliation | Channel statuses in `channel-listings.json` need normalization before they are mapped to sales orders. | Status spelling differs from sales-history input. |
| 2026-09-13 | maintainer note | Credential-safe notes must name source, schema/RLS, edge administration, and Render ownership without values for secrets. | README lacks these boundaries. |

## Recovery boundaries claimed by source material

- **Browser client:** uses publishable Supabase connection information only; it must observe RLS and must not contain service-role or Render credentials.
- **Database:** owns tables, constraints, RLS policies, and security-definer/transactional guards where warranted; all changes require tracked migrations.
- **Edge administration:** owns master-user account mutation and final-active-master protection; it must record audit events.
- **Render:** owns the existing service, build/start/static settings, public (non-secret) environment values, and release state.

The current repository and project state are intentionally incomplete. Validate every claim against live Supabase and Render state before implementation.
