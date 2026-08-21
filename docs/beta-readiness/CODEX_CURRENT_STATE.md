# Codex independent Beta readiness state

Updated: 2026-08-21

## Verdict

- Owner-only Web Beta: deployed and usable after authenticated smoke testing.
- First external user: **NO-SHIP** until the blocking items below are closed or explicitly removed from the first-user scope.
- Public production: unchanged; the promotion pull request remains a draft.

## Verified complete after the Pro baseline

- Separate owner-only Sites Beta project created.
- Beta and public use distinct Sites project IDs and distinct D1/R2 resources.
- Long-lived `beta` branch created; feature pull requests target Beta first.
- `main` and `beta` protected with required `web` and `analyze` checks, strict up-to-date branches, linear history, admin enforcement, force-push/deletion protection, and conversation resolution.
- Manual promotion workflow creates a draft pull request from Beta source differences while excluding `.openai/hosting.json`; Beta user data is never promoted.
- Web/iOS locator columns preserve the other platform's exact locator when omitted.
- EPUB download responses use `private, no-store` to prevent cross-account browser-cache reuse.
- Device token generation uses an explicit unbiased five-bit mapping.
- Search snippet sanitization no longer performs tag stripping before entity replacement.
- Search titles and snippets now share a character-level markup stripper that also drops incomplete tags before text reaches the model context.
- Baseline browser security headers and a central cross-origin mutation guard added.
- GitHub Actions upgraded to checkout/setup-node v5 and CodeQL v4.
- Plain-language `/privacy` page added and linked before sign-in.
- Runtime dependencies pass `npm audit --omit=dev --audit-level=high`. Two high advisories remain in the build-only vinext/image-size chain and require a separate framework upgrade.
- Beta D1 schema contains separate reader books, progress, deletion barriers, state, and devices tables.
- Owner-authorized ChatGPT sign-in completed in the deployed Beta. The authenticated `/reader` first-run path, calibration skip, empty shelf, import entry, device dialog, privacy page, and cloud settings write were observed successfully.
- The first external Beta is explicitly Web-only. iPhone/iPad delivery and native endpoint work are outside this release scope.
- Runtime DDL was removed. The exact cloud-built Sites archive now contains immutable SQL migrations and hashes; Beta deployment applied the new rate-limit table. A failed remote-build migration attempt was detected and immediately rolled back to the prior verified version before the corrected cloud artifact was deployed.
- Persistent account-level budgets now protect AI, reader-state, progress, upload, deletion, export, and device mutations. The deployed state-write path created the expected redacted rate-limit row.
- EPUB uploads now require a bounded ZIP container with safe paths, supported compression, required EPUB structure, no encrypted/script entries, bounded expansion, and a server-computed SHA-256 matching the identifier. Cloud storage is limited to 25 EPUBs and 500 MB per account.
- The AI status distinguishes the disclosed Wikipedia fallback from Brave configuration; AI remains disabled because Beta has no provider credential.
- A self-service data dialog provides a streaming ZIP export, explicit cloud-account erasure with a typed confirmation, local Dawn-data clearing, and platform-owned sign-out. The empty-account export produced authenticated downloads and consumed the expected two-per-hour budget.
- The owner-authorized destructive erasure drill completed successfully: one state row and two rate-limit rows were removed; books, progress, devices, and tombstones remained empty; every user-data table independently read zero rows after deletion. Reloading returned to first-run calibration, and skipping calibration recreated a clean usable account with one state/rate row and no publications.
- A small-team incident response runbook covers environment identification, containment, credential/device revocation, rollback, reconciliation, communication, and recovery gates.

## Still blocks first external invite

- Beta AI is intentionally disabled; enabling it later requires a separate provider credential, cost budget, and AI acceptance pass.
- No verified external-user onboarding/acceptance session yet.
- Application rollback is proven; D1/R2 backup and disposable-resource restore remain unproven.

## Pro findings disposition

| Status | Findings |
| --- | --- |
| Resolved in Beta | BR-001, BR-002 application path, BR-011, BR-014, BR-019, BR-021 |
| Partially resolved | BR-003, BR-006 through BR-010, BR-013, BR-015 through BR-017, BR-020, BR-022 through BR-024, BR-027 through BR-032 |
| Open and in scope | BR-004; minimum external-user onboarding and accessibility checks |
| Disabled for this release | BR-018; Beta AI has no provider credential |
| Out of first-user scope | BR-005, BR-025, BR-026; the first external Beta is Web-only |

The detailed evidence and proposed remediations remain in the Pro baseline files. Every item must be rechecked against the current branch before implementation because the baseline predates the fixes listed above.

## Evidence boundary

Cloud CI, CodeQL, exact cloud artifact creation, Sites deployment/rollback, access policy, migration application, D1 table inventory, authenticated first-run navigation, state writes, export initiation, destructive account erasure, local reset, and clean-account recreation are verified. No EPUB/PDF was uploaded during the smoke test. AI calls, publication rendering, D1/R2 restore, external-user acceptance, and public promotion are not yet verified.
