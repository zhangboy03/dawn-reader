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

## Still blocks first external invite

- Beta has no AI runtime credentials; public secret values are redacted and were not copied. Wikipedia remains the disclosed search fallback.
- Newly implemented rate limits, EPUB validation, storage quotas, account export/delete, and sign-out must pass cloud gates and destructive Beta acceptance before they move to the verified list.
- No verified external-user onboarding/acceptance session yet.
- No end-to-end rollback drill or destructive test-account deletion drill yet.

## Pro findings disposition

| Status | Findings |
| --- | --- |
| Resolved in Beta | BR-001, BR-011, BR-021 code path |
| Partially resolved | BR-002, BR-013, BR-015, BR-020, BR-024, BR-027, BR-028, BR-029, BR-031 |
| Open and in scope | BR-003, BR-004, BR-006 through BR-010, BR-012, BR-014, BR-016 through BR-019, BR-022, BR-023, BR-030, BR-032 |
| Out of first-user scope | BR-005, BR-025, BR-026; the first external Beta is Web-only |

The detailed evidence and proposed remediations remain in the Pro baseline files. Every item must be rechecked against the current branch before implementation because the baseline predates the fixes listed above.

## Evidence boundary

Cloud CI, CodeQL, Sites saved versions/deployments, access policy, D1 table inventory, authenticated first-run navigation, and the initial cloud settings write are verified. No EPUB/PDF was uploaded during the smoke test. AI calls, publication rendering, destructive account erasure, external-user acceptance, rollback, and public promotion are not yet verified.
