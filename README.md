# M-T556-V4 inventory source-state fixture

Synthetic input fixture for a later implementation workflow. It intentionally contains raw inventory snapshots, dated sales facts, aliases, cost policy, and stale prior-state UI artifacts. It contains **no completed velocity classification, reconciled report, implementation, deployment, or PDF**.

Inputs live in `data/`, shared rules in `config/`, and untrusted/stale prior-state artifacts in `artifacts/`. Canonical product IDs are `P-1001` through `P-1025`. Dates are ISO dates; quantities are units; currency is USD unless a listing specifies otherwise.
