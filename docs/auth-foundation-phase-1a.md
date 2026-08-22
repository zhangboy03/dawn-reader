# Dawn Reader authentication foundation — Phase 1A

Date: 2026-08-22  
Status: implementation slice; external sign-in remains disabled

## Purpose

This release creates the ownership boundary required before Dawn can admit a
second person. It does not add Supabase, email, public signup, reusable invite
codes, or account switching.

The release has four invariants:

1. Cloud data resolves through an internal `reader_accounts.id` and an explicit
   identity mapping rather than treating an identity-provider subject as the
   login architecture.
2. Browser databases and local-storage keys are scoped by environment and
   internal account.
3. Origin-global legacy browser data remains quarantined until the current
   owner explicitly imports it. Import is a local copy and never uploads data.
4. Opening the library never uploads ambiguous local EPUBs or progress. A new
   file selected by the signed-in user may still use the existing explicit
   upload flow.

## Compatibility account

The owner-only Beta already stores D1 rows and R2 objects under the current
opaque Sites subject. Phase 1A preserves that value as the existing internal
account ID and creates a separate `(environment, issuer, subject) -> account`
mapping. The value is no longer interpreted as a provider credential or used
to decide which identity providers may own the account.

This avoids a risky D1/R2 rewrite before the first external tester. Future
accounts may use random internal IDs, and a future email/Apple identity can be
linked to the existing owner account without changing book ownership.

## Browser migration

New data is written only to:

```text
IndexedDB
  dawn-reader-library:v3:<environment:account>
  dawn-reader-evidence:v2:<environment:account>

localStorage
  dawn-reader:v3:<environment:account>:<existing-key>
```

The old databases and `dawn-reader-*` keys are read only during inventory and
explicit import. Import copies records into the active namespace, verifies
transaction completion, leaves the source intact, and performs no network
request. Choosing “keep quarantined” writes only an account-scoped decision.

## Deployment and migration order

1. Keep Sites access and Dawn authentication unchanged; do not add a second
   identity provider or external tester.
2. Apply the additive `reader_accounts` and `reader_identities` migration.
3. Deploy the account-aware application from the same exact commit.
4. Sign in as the current owner and confirm the identity mapping was created.
5. If the browser reports legacy local data, choose import or quarantine.
6. Verify the owner cloud shelf, one existing EPUB download, one progress
   update, one local-only PDF, and one device-session request.
7. Inspect logs for authentication, D1 migration, R2, and cross-account errors.

No external tester is admitted by this release.

## Rollback

Before the first account-aware request, the previous release can be restored.

After `reader_accounts` or `reader_identities` contains data, roll back only to
this release or a later account-aware release. The migration is additive, and
the compatibility account ID keeps existing D1/R2 paths readable. Do not drop
the new tables during an incident.

Browser rollback does not delete either namespace. The legacy source stays
intact; account-scoped copies can be ignored by the previous release. If the
claim transaction fails, Dawn reports the failure and retains the source.

## Remaining no-ship gates

Before the first external tester:

- add a two-account route and browser negative-test matrix;
- implement an atomic account-switch coordinator for a future app-owned login;
- prove session cookie, CSRF, canonical-host and no-bypass behavior on Sites;
- add one-time per-person enrollment and revocable Dawn sessions, or approve a
  managed OTP provider;
- test export, erasure, session revocation, restore, and owner-only rollback;
- establish separate development and Beta environments.
