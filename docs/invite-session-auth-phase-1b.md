# Dawn Reader invitation and session authentication — Phase 1B

Date: 2026-08-22  
Status: implementation slice; no tester account or invite is created by deployment

## Scope

This release adds an app-owned Web entry path for the first external tester.
The existing mapped ChatGPT identity remains an owner-only operator path. A
public visitor does not become a Dawn account merely because their browser is
signed in to ChatGPT.

The external path is:

```text
pre-created reader account
  -> one-time 256-bit invitation
  -> atomic consume
  -> independent 256-bit Dawn session
  -> HttpOnly, Secure, SameSite=Lax host-only cookie
```

## Security properties

- Raw invitation and session secrets are never stored in D1. D1 stores HMAC
  SHA-256 fingerprints plus a key version.
- The invitation expires after 72 hours, is single use, and is not accepted as
  a session credential.
- Invitation redemption inserts the session and consumes the invitation in one
  D1 batch. Exactly one insert and one update must succeed.
- Redeem attempts use a 15-minute HMAC-pseudonymized network bucket with a
  uniform failure response. Raw network addresses are not stored.
- Browser mutations require an exact same-origin `Origin` header. Native device
  bearer requests retain their separate authorization path.
- Dawn sessions have a seven-day idle expiry and 30-day absolute expiry.
- Account `auth_epoch`, per-session revocation and invitation revocation provide
  independent kill switches.
- The owner admin APIs require both the internal owner role and the already
  linked ChatGPT owner identity. Device or tester sessions cannot create invites.
- Contact email is optional, unverified operator metadata. It is not a login
  identity, ownership key or merge signal.

## Migration

Migration `0004` adds invitation, session and rate-limit tables plus account
role/contact/auth-epoch fields. It marks the oldest existing account as owner.
This is valid only because Phase 1A established and verified an owner-only
database before this release.

The deployment must configure `DAWN_AUTH_HMAC_KEY` as a hosted secret containing
at least 32 random bytes before testing `/join`. Beta and public environments
must use different keys.

## Rollout order

1. Keep the existing owner-only Dawn account and Sites access policy unchanged.
2. Configure the Beta HMAC secret.
3. Apply migration `0004` and deploy the exact account-aware `main` SHA.
4. Verify the owner can open `/admin/invites`; anonymous callers receive no
   account and cannot use owner APIs.
5. In a disposable browser, verify invalid code, one successful redemption,
   replay rejection, logout, revoke, CSRF rejection and empty local/cloud data.
6. Erase the disposable account/session fixtures or keep them explicitly marked
   as test-only.
7. Only after those gates pass may the owner create the real first-tester invite.

## Rollback

Before any invite is created, the previous account-aware release can be restored
while leaving the additive tables in place.

After an invitation or Dawn session exists, roll back only to this release or a
later session-aware release. A source rollback must not bypass session revocation,
re-enable arbitrary ChatGPT account creation, or expose account-global browser
storage. During an incident, revoke active sessions and invites first, then
restore the last verified session-aware SHA.

## Explicit non-goals

- no public signup;
- no email delivery or email verification;
- no password or reusable shared code;
- no Supabase/Apple/Google identity linking;
- no native iOS login change;
- no automatic invitation transmission.
