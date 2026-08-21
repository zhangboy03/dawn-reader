# Dawn Reader Beta readiness

This directory keeps the external Pro research baseline separate from Codex's independent current-state adjudication.

- `pro-baseline/DAWN_BETA_READINESS_REPORT.md`: executive readiness report.
- `pro-baseline/FINDING_LEDGER.md`: 32 repository-level findings with evidence.
- `pro-baseline/CLAIM_SOURCE_LEDGER.md`: external-source claim ledger.
- `pro-baseline/IMPLEMENTATION_BACKLOG.md`: proposed staged backlog.
- `CODEX_CURRENT_STATE.md`: current verified disposition after Beta implementation work.

The Pro files are research inputs, not automatically accepted product truth. `CODEX_CURRENT_STATE.md` is the live decision record and must be updated as fixes, tests, and scope decisions change.

## Baseline integrity

The Pro review used a ZIP containing 186 tracked files from public baseline commit `adf73dda00a45762b3baacb961d20f10bada415e`.

| File | SHA-256 |
| --- | --- |
| `DAWN_BETA_READINESS_REPORT.md` | `b7464d9de90495f2b4b3eb64c534c884b9e8a72a20742cf5de0347ae89cc0383` |
| `FINDING_LEDGER.md` | `be459e4b0e1e440169a88dc54412d82766075b54709dbb6bd5088f61785d55be` |
| `CLAIM_SOURCE_LEDGER.md` | `d1f52a1cfd4136b9e83c059c550373d125413d08d0a21213fddbce964ad0e5a4` |
| `IMPLEMENTATION_BACKLOG.md` | `5ceb9e2084dddb9891e9e2251bdf234e1fbcc7cb75416bcf1add3c9974fada48` |

The generated-download bridge returned an authorization error, so the four canonical files were recovered inline from the same Pro conversation and split deterministically. No generated ZIP is represented as retrieved.
