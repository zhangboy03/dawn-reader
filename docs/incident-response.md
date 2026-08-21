# Dawn Reader incident response

Owner: repository owner and current Dawn Reader deployer.

This runbook covers the owner-only Beta and public Dawn Reader separately. Never use a Beta resource, backup, credential, or deployment as a substitute for a public resource with a similar name.

## Severity and first response

- **SEV-1:** suspected cross-account access, exposed identity/book text/token/provider key, destructive data loss, or active account takeover. Stop invitations, disable affected mutations or providers, preserve evidence, and begin containment immediately.
- **SEV-2:** partial D1/R2 inconsistency, elevated authenticated errors, failed migration, broken sign-in, or unavailable reading for multiple users. Freeze promotion and restore the last verified application version while preserving additive schema.
- **SEV-3:** isolated display, accessibility, import, or device problem without evidence of disclosure or data loss. Record, reproduce, and repair through Beta.

Do not paste private text, email addresses, bearer tokens, provider bodies, API keys, EPUB bytes, or full account identifiers into issues or logs.

## Triage

1. Record UTC start time, environment, exact deployed commit/version, affected route, first observed symptom, and a random incident ID.
2. Determine whether the event affects Beta, public, or both. Verify project ID, D1 binding, R2 binding, access policy, and current deployment before acting.
3. Classify confidentiality, integrity, availability, and cost impact. Treat uncertain cross-account access as SEV-1.
4. Preserve redacted request IDs, deployment logs, CI/CodeQL results, migration state, table/object counts, and provider status. Do not increase logging to include content.

## Containment

- AI/search key exposure: disable the affected environment variable first, rotate the provider credential, then verify old credentials fail before re-enabling.
- Device token exposure: revoke the named device; if scope is uncertain, disable device creation and revoke all affected account devices. Never log raw tokens.
- Wrong deployment or application regression: stop promotion and redeploy the last known-good exact SHA. Keep additive migrations in place unless a verified restore is required.
- Migration or D1 corruption: stop writes to affected routes, capture Time Travel/export evidence if available, and restore only into a verified target resource.
- Partial R2/D1 mutation: disable upload/delete, compare user-scoped D1 rows and R2 keys in report-only mode, then repair reviewed discrepancies. Never bulk-delete unmatched keys without tenant and age checks.
- Suspected cross-account access: disable the affected route, preserve redacted evidence, verify identity predicates on every data access, and notify affected users when exposure is confirmed or reasonably likely.

## Recovery gates

Before reopening the affected feature:

1. Root cause and affected scope are documented.
2. The fix has passed Beta CI, CodeQL, targeted regression checks, and an adversarial authorization test.
3. D1/R2 counts and identities reconcile for the affected scope.
4. Rotated credentials and revoked tokens have been tested.
5. The restored or rolled-back deployment maps to an exact pushed SHA.
6. A user-facing notice is prepared when data confidentiality, integrity, or material availability was affected.

## Communication and review

Use GitHub private vulnerability reporting for security reports. Public issues must contain only sanitized reproduction information. For SEV-1 and material SEV-2 incidents, record the timeline, user impact, containment, recovery evidence, remaining uncertainty, and a named follow-up owner. Complete a short post-incident review before the next public promotion.
