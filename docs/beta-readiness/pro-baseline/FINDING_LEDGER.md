Dawn Reader — Beta Readiness Finding Ledger

Baseline: adf73dda00a45762b3baacb961d20f10bada415e
Audit date: 2026-08-21
Total findings: 32
Severity model:

blocker: release architecture or recovery proof absent; no first external invite.

P0: likely confidentiality, integrity, destructive-loss, abuse, or disclosure failure; fix or disable affected feature before invite.

P1: material reliability, privacy, accessibility, or operational gap; minimum applicable subset required before invite.

P2: bounded maturity gap; may follow only with containment and named ownership.

Summary
ID	Severity	Title	Gate	First-user disposition
BR-001	blocker	No proven isolated owner-only Beta environment	G1	Blocks
BR-002	blocker	No exact-SHA promotion, deployment mapping, or rollback path	G0, G9	Blocks
BR-003	blocker	Migration process is not release-safe	G3	Blocks
BR-004	blocker	No demonstrated D1/R2 backup and restore	G3	Blocks
BR-005	P0	Device credentials lack a complete lifecycle	G2	Blocks device use
BR-006	P0	Pairing/device creation is insufficiently abuse-resistant	G2	Blocks pairing
BR-007	P0	API and AI resource consumption is unbounded	G2	Blocks AI/public mutations
BR-008	P0	EPUB upload validation is extension-based	G4	Blocks cloud upload
BR-009	P0	No per-user storage or book quota	G4	Blocks cloud upload
BR-010	P0	D1/R2 mutations are non-atomic and unreconciled	G4	Blocks cloud mutation
BR-011	P0	Web/iOS progress writes can erase each other’s locators	G5	Blocks cross-device sync
BR-012	P0	Reader state updates can silently lose concurrent changes	G5	Blocks multi-device state sync
BR-013	P0	Origin, CSRF, and trusted-header boundary is unproven	G2	Blocks mutations
BR-014	P0	No complete account export and erasure workflow	G6	Blocks invite
BR-015	P0	Privacy, copyright, provider, and storage disclosures are incomplete	G6	Blocks invite
BR-016	P0	No sufficient redacted observability and alerting	G7	Blocks invite
BR-017	P0	No incident, revocation, and recovery runbook	G7	Blocks invite
BR-018	P1	AI data, attribution, fallback, and cost boundaries are incomplete	G6, G8	Blocks AI unless disabled
BR-019	P1	Search configuration and Wikipedia fallback are misrepresented	G6, G8	Blocks search unless disabled
BR-020	P1	Browser-local PDF/evidence lifecycle is incomplete	G6	Blocks local feature unless disclosed/controlled
BR-021	P1	Security headers and sensitive cache policy are incomplete	G2, G8	Minimum subset blocks invite
BR-022	P1	First-run, offline, failure, and support states are incomplete	G8	Basic subset blocks invite
BR-023	P1	Accessibility acceptance is incomplete	G8	Minimum keyboard/zoom/screen-reader checks block
BR-024	P1	Large, corrupt, and media-heavy publication limits are insufficiently proven	G4, G8	Blocks exposed unsupported cases
BR-025	P1	iOS hard-codes the public endpoint	G1, G5	Blocks iOS Beta/public parity
BR-026	P1	iOS disconnect, account switch, and purge semantics are incomplete	G5, G6	Blocks iOS use
BR-027	P1	CI omits migration, destructive cloud, deployment, and iOS checks	G0, G3, G9	Core cloud subset blocks
BR-028	P1	Workflow dependencies and release artifacts lack strong provenance	G0, G9	Covered partly by BR-002; complete before broader release
BR-029	P1	Dependency, SwiftPM, license, and update governance is incomplete	G0	Conditional
BR-030	P2	EPUB embedded/remote content policy is incomplete	G2, G6, G8	Disable remote content if unverified
BR-031	P2	User support and operational ownership are underspecified	G7, G8	Basic contact required
BR-032	P2	Retention and stale-record cleanup are undefined	G6, G7	May follow with documented interim policy
BR-001 — No proven isolated owner-only Beta environment

Severity: blocker
Status at baseline: Open
Affected users/data: Owner Beta books and history; public accounts, books, progress, devices, settings, secrets, and logs
Gate: G1

Repository evidence

.openai/hosting.json:1-5 defines one fixed Sites project and bindings DB and BOOKS.

build/sites-vite-plugin.ts:15-32 copies the hosting manifest into the build output.

vite.config.ts:3-20,23-42 consumes the same binding configuration.

docs/development-workflow.md:8-12 records one public live address and no preview URL.

docs/development-workflow.md:54-65 itself identifies the need for independent development/preview and Beta before an external tester.

External evidence

Cloudflare environment separation: https://developers.cloudflare.com/workers/wrangler/environments/

OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/

These sources support resource and configuration separation as a control. They do not prove that Sites exposes the same controls.

Likely failure mode

A Beta deployment, migration, upload, deletion, secret rotation, or test account touches public resources. Owner books or experimental records become visible to an external user, or a Beta defect damages public state.

Smallest safe fix

Create a platform-enforced owner-only Beta project with independent D1, R2, secrets, auth audience/domain, logs, and access. Add an environment identity check before any migration or deployment. Never copy user data between environments.

Acceptance test

Record distinct Beta/public project, D1, R2, secret-set, domain, and access-policy identifiers.

Create unique synthetic marker records/objects in each environment.

Prove each marker is inaccessible from the other environment and account.

Attempt unauthenticated Beta access and prove platform denial.

Rotate a Beta-only secret and prove public remains healthy.

Attach evidence to G1.

Rollback

Disable or remove Beta access and detach Beta resources. Do not modify public data or bindings. Recreate Beta from migrations and synthetic fixtures if isolation is uncertain.

First-user disposition: Blocks the first external user. Owner-only Beta also remains blocked until isolation is proven.

BR-002 — No exact-SHA promotion, deployment mapping, or rollback path

Severity: blocker
Status at baseline: Open
Affected users/data: All runtime behavior and public data
Gate: G0, G9

Repository evidence

.openai/hosting.json:1-5 contains a tracked fixed project ID.

build/sites-vite-plugin.ts:15-32 embeds the hosting manifest in build output.

.github/workflows/ci.yml:1-24 tests and builds but does not deploy or emit a deployment manifest.

No repository workflow maps source SHA, artifact hash, config hash, migration head, and Sites deployment/version.

docs/development-workflow.md:18-23 proposes deploying an exact SHA but does not implement provenance or rollback.

External evidence

Workers versions/deployments: https://developers.cloudflare.com/workers/configuration/versions-and-deployments/

Workers rollback: https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/

GitHub artifact attestations: https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations

GitHub rulesets: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets

Likely failure mode

The operator deploys the wrong project, rebuilds different bytes from the same source, cannot identify which migration accompanies a runtime, or “rolls back” to an unverified build.

Smallest safe fix

Add a protected release/public ref, immutable annotated tags, deterministic artifact generation, environment-config hashing, explicit target-project checks, and a release manifest that maps Beta acceptance to the public deployment and rollback target.

Acceptance test

One accepted source SHA produces a recorded artifact hash.

Beta and public deployment records identify that SHA/artifact and their config hashes.

Public promotion introduces no source/dependency change after Beta acceptance.

A disposable release rehearsal deploys revision N, deploys N+1, and restores N.

Runtime release identity matches the manifest.

Rollback

Switch to the recorded prior deployment/artifact. Retain compatible additive schema. Disable the feature or roll forward if the schema cannot safely support the prior app.

First-user disposition: Blocks the first external user.

BR-003 — Migration process is not release-safe

Severity: blocker
Status at baseline: Open
Affected users/data: D1 books, progress, state, tombstones, and devices
Gate: G3

Repository evidence

db/index.ts:13-31 executes CREATE TABLE IF NOT EXISTS reader_book_deletions on a runtime path.

drizzle/0000_ambiguous_joseph.sql:1-29 creates initial tables.

drizzle/0001_military_silver_samurai.sql:1-14 adds devices and columns.

drizzle/0002_nosy_whizzer.sql:1-6 adds deletion tombstones.

No deployment workflow applies checksum-verified migrations per environment.

No expand-contract or N/N-1 compatibility tests were found.

External evidence

D1 migrations: https://developers.cloudflare.com/d1/reference/migrations/

D1 import/export: https://developers.cloudflare.com/d1/best-practices/import-export-data/

Likely failure mode

Runtime requests race schema creation; Beta and public drift; a partially applied or incompatible migration makes current or rolled-back code fail; an operator targets the wrong database.

Smallest safe fix

Remove runtime DDL. Introduce an explicit per-environment migration runner with resource identity assertion, immutable checksums, migration lock, preflight backup, additive/expand-contract policy, and N/N-1 compatibility tests.

Acceptance test

Apply migrations to an empty database and a copy at every supported previous migration head.

Reapplying completed migrations is a no-op.

Altered checksum or wrong resource ID aborts.

Current and previous application revisions operate during the expand phase.

Failure mid-migration leaves a documented recoverable state.

Production migration cannot begin without G3 evidence.

Rollback

Prefer application rollback with additive schema retained. For incompatible changes, disable the feature and roll forward. Restore data only from a verified backup; do not run a blind destructive down-migration.

First-user disposition: Blocks the first external user.

BR-004 — No demonstrated D1/R2 backup and restore

Severity: blocker
Status at baseline: Open
Affected users/data: EPUB files, metadata, progress, settings, tombstones, devices
Gate: G3

Repository evidence

SECURITY.md:3-17 assigns backups/deletion to deployers but supplies no implementation.

No backup manifest, scheduled export, R2 recovery copy, restore script, or restore test was found.

Book deletion spans D1 and R2, increasing the need for coordinated recovery.

External evidence

D1 Time Travel: https://developers.cloudflare.com/d1/reference/time-travel/

D1 import/export: https://developers.cloudflare.com/d1/best-practices/import-export-data/

R2 lifecycle controls: https://developers.cloudflare.com/r2/buckets/object-lifecycles/

These sources describe service capabilities; current Sites exposure and enablement remain unverified.

Likely failure mode

A bad migration, accidental deletion, compromised token, application defect, or operator error destroys data that cannot be restored or can be restored only partially.

Smallest safe fix

Define separate Beta/public backup jobs and manifests. Protect D1 plus an independent recoverable R2 copy/versioning mechanism. Record encryption/access/retention. Perform a disposable restore drill before the invite.

Acceptance test

Back up a synthetic D1/R2 state.

Restore to disposable resources.

Compare table counts, primary keys, object keys, sizes, content hashes, and tombstones.

Open restored books and verify progress.

Record owner-declared RPO/RTO and prove the drill meets them.

Prove Beta backup material cannot overwrite public.

Rollback

Abort release when backup or restore verification fails. Preserve the prior public deployment and resources. If recovery is required, restore only into verified target resources and reconcile post-recovery writes.

First-user disposition: Blocks the first external user.

BR-005 — Device credentials lack a complete lifecycle

Severity: P0
Status at baseline: Open
Affected users/data: Synced books, progress, settings, and account access
Gate: G2

Repository evidence

src/server/deviceAuth.ts:1-16 creates dawn_ bearer tokens.

src/server/deviceAuth.ts:26-36 stores SHA-256 hashes.

app/chatgpt-auth.ts:49-71 accepts active unexpired-by-policy tokens, but no expiry field is enforced.

db/schema.ts:43-53 has creation, last-used, and revoked timestamps but no expiry, scope, token version, or rotation lineage.

External evidence

OWASP Secrets Management: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html

OWASP REST Security: https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html

Likely failure mode

A copied device token remains useful indefinitely and grants more capability than necessary. The user cannot rotate it cleanly or identify which token was compromised.

Smallest safe fix

Add expiry, token version, narrowly defined scopes, rotation/replacement, last-used diagnostics, and a compromise-revocation workflow. Never log raw tokens.

Acceptance test

Create, use, rotate, expire, and revoke a token.

Old token fails every protected device route immediately after revocation/rotation.

Token cannot access routes outside its declared scope.

Logs contain only a non-secret device/token identifier.

UI clearly identifies active, stale, expired, and revoked devices.

Rollback

Disable new token creation and retain revocation. Support an overlap window for a controlled client migration only; never reactivate a revoked credential silently.

First-user disposition: Blocks device pairing and iOS sync. The external invite can proceed only if device-token features are disabled and inaccessible.

BR-006 — Pairing/device creation is insufficiently abuse-resistant

Severity: P0
Status at baseline: Open
Affected users/data: User account, device list, API capacity
Gate: G2

Repository evidence

app/api/devices/route.ts:24-41 lets any authenticated session create and receive a new token.

No maximum active-device count, recent-auth challenge, creation cooldown, idempotency key, rate limit, or explicit audit event was found.

app/api/devices/[id]/route.ts:29-37 revokes by timestamp but returns success even when no matching record exists.

External evidence

OWASP API Security — unrestricted resource consumption: https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/

OWASP CSRF Prevention: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html

Likely failure mode

A stolen browser session or cross-site mutation creates many durable tokens. Device rows and credentials accumulate, and the user lacks a reliable audit trail.

Smallest safe fix

Require same-origin/CSRF protection and recent session confirmation for token display/creation; enforce active-device and creation-rate limits; make creation idempotent; record redacted security events.

Acceptance test

Cross-origin creation fails.

Repeated identical submission produces at most one token.

Active-device ceiling and cooldown return a documented 429/409.

User receives a clear audit entry without raw token.

Revoking a nonexistent or foreign device does not disclose its existence.

Rollback

Disable device creation while preserving list and revoke. Existing valid devices may continue only within the lifecycle policy.

First-user disposition: Blocks pairing.

BR-007 — API and AI resource consumption is unbounded

Severity: P0
Status at baseline: Open
Affected users/data: Availability, owner/provider cost, all users
Gate: G2

Repository evidence

app/api/rewrite/route.ts:4-18 and app/api/chat/route.ts:4-18 authenticate but implement no per-user/IP rate or concurrency limit.

src/server/ai.ts:77-102 permits an external provider request with a 30-second timeout but no per-user budget.

app/api/state/route.ts parses JSON without an explicit route body cap.

Device and progress mutations also have no visible route budgets.

External evidence

OWASP API4:2023: https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/

Workers limits: https://developers.cloudflare.com/workers/platform/limits/

D1 limits: https://developers.cloudflare.com/d1/platform/limits/

R2 limits: https://developers.cloudflare.com/r2/platform/limits/

Likely failure mode

One user, script, stolen session, or token exhausts AI budget, worker execution, D1 operations, or provider concurrency and degrades the service.

Smallest safe fix

Set route-specific pre-parse body caps, per-identity and per-IP token buckets, AI concurrency and daily budget limits, storage quotas, provider timeouts, and global emergency kill switches.

Acceptance test

Requests above each body/rate/concurrency/cost budget receive bounded 4xx/429 responses with Retry-After where appropriate.

Rejected requests do not call the AI/search provider or mutate storage.

One user cannot exhaust another user’s budget.

Kill switches disable AI/search without disabling local reading.

Budget and rejection metrics are observable without content.

Rollback

Raise a reviewed threshold or disable an expensive feature. Do not remove hard body/upload protections.

First-user disposition: Blocks AI and exposed mutation APIs until enforced.

BR-008 — EPUB upload validation is extension-based

Severity: P0
Status at baseline: Open
Affected users/data: Availability, R2/D1 integrity, reader execution context
Gate: G4

Repository evidence

app/api/books/route.ts:32-48 checks File, filename extension .epub, and compressed size up to 40 MiB.

No server-side MIME/container verification, ZIP traversal detection, expanded-size cap, encrypted-entry policy, required EPUB structure validation, or active-content policy was found.

External evidence

OWASP File Upload Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html

EPUB 3.3: https://www.w3.org/TR/epub-33/

EPUB Reading Systems 3.3: https://www.w3.org/TR/epub-rs-33/

Likely failure mode

A renamed or malformed archive consumes excessive resources, triggers parser defects, contains path traversal/oversized entries, or causes unexpected remote/script behavior when rendered.

Smallest safe fix

Parse and validate the EPUB container before persistence: ZIP safety, required mimetype, META-INF/container.xml, supported package, path normalization, entry/count/expanded-size limits, encryption policy, and active/remote-content classification.

Acceptance test

Reject fixtures containing:

wrong extension/type;

invalid ZIP;

missing or invalid EPUB container;

traversal paths;

duplicate/conflicting normalized paths;

excessive entry count;

excessive expanded size or compression ratio;

unsupported encryption;

malformed package;

prohibited active or remote content.

Valid EPUB fixtures must still upload and render.

Rollback

Disable cloud upload and retain local import. Quarantine rejected or indeterminate files; do not persist them to the normal R2 namespace.

First-user disposition: Blocks cloud EPUB upload.

BR-009 — No per-user storage or book quota

Severity: P0
Status at baseline: Open
Affected users/data: Availability, storage cost, all users
Gate: G4

Repository evidence

app/api/books/route.ts:9 defines a per-file 40 MiB limit.

No aggregate per-user byte quota, book-count limit, pending-upload reservation, or orphan accounting was found.

Legacy deduplication can read and hash an existing R2 object in-request.

External evidence

OWASP API4:2023: https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/

R2 limits: https://developers.cloudflare.com/r2/platform/limits/

Likely failure mode

A valid account uploads many near-limit files, creating unbounded cost and storage pressure. Failed operations leave objects that are not charged or visible.

Smallest safe fix

Define per-user book-count and byte quotas, reserve capacity before upload, finalize after verified persistence, account for orphans, expose usage, and add an administrative emergency ceiling.

Acceptance test

A user cannot exceed count or byte quota via sequential, concurrent, or retrying uploads.

Failed upload releases reservation.

Reconciliation detects bytes not represented in D1.

Quota status is isolated per user.

UI reports current use and non-destructive resolution.

Rollback

Increase policy limits if too restrictive. Do not remove accounting. Disable upload temporarily if quota state is inconsistent.

First-user disposition: Blocks cloud EPUB upload.

BR-010 — D1/R2 mutations are non-atomic and unreconciled

Severity: P0
Status at baseline: Open
Affected users/data: EPUB files, metadata, progress, deletion state
Gate: G4

Repository evidence

app/api/books/route.ts:66-93 writes R2, then D1, then removes a tombstone without a cross-store transaction or compensation.

app/api/books/[id]/route.ts:10-41 writes a tombstone, deletes R2, deletes book metadata, then progress.

src/server/deleteBookResources.ts:1-20 performs sequential deletes.

src/server/library.ts:17-50 merges/deduplicates records and objects across stores.

No operation journal, idempotency key, conditional state machine, or orphan reconciler was found.

External evidence

IETF HTTPAPI idempotency-key draft: https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/

OWASP REST Security: https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html

The idempotency document is a draft and supports the request-deduplication concept, not a mandatory implementation.

Likely failure mode

A timeout or retry creates an orphan R2 object, missing D1 row, stale progress, premature tombstone removal, or partial deletion. The client cannot distinguish success from unknown completion.

Smallest safe fix

Use an operation ID and D1 state machine for upload/delete, make retries idempotent, use conditional transitions, compensate safe failures, and run a dry-run/repair reconciler that compares D1 and R2.

Acceptance test

Inject failure before and after each D1/R2 step. For every failure and retry:

at most one logical book remains;

no foreign object is touched;

final state converges to complete or deleted;

tombstone semantics remain correct;

orphan scanner identifies and safely repairs the discrepancy;

client receives stable operation status.

Rollback

Disable the affected mutation. Run reconciliation in report-only mode, review findings, then repair. Do not bulk-delete unmatched objects without tenant and age checks.

First-user disposition: Blocks cloud upload and deletion.

BR-011 — Web/iOS progress writes can erase each other’s locators

Severity: P0
Status at baseline: Open
Affected users/data: Reading position and cross-device continuity
Gate: G5

Repository evidence

db/schema.ts:17-26 stores cfi, nativeLocator, percentage, client, and updatedAt.

app/api/books/[id]/progress/route.ts:28-79 replaces all locator fields and compares client-supplied timestamp strings.

src/lib/cloudSync.ts:85-98 submits Web CFI but omits native locator.

ios/DawnReader/DawnReader/DawnSyncClient.swift:172-197 submits native locator with cfi = nil.

ios/DawnReader/DawnReader/LibraryModel.swift:372-390 resolves by lexicographic client timestamps.

External evidence

Readium: https://readium.org/

KOReader: https://github.com/koreader/koreader

Zotero sync overview: https://www.zotero.org/support/sync

Comparator practice supports explicit locator/data conflict semantics, not a direct protocol prescription.

Likely failure mode

Reading on Web nulls the iOS locator; reading on iOS nulls the CFI. Device clock skew can move the user backward or make stale state win.

Smallest safe fix

Introduce a versioned progress protocol with patch semantics, independent Web/native locator fields, server-assigned monotonic revision, explicit client observation time, and deterministic conflict rules. Preserve unknown fields.

Acceptance test

Alternate Web and iOS updates and prove both locators survive.

Simulate clocks ±24 hours.

Send duplicate, delayed, and concurrent requests.

Verify monotonic server revision and deterministic final state.

Verify deletion wins according to an explicit server ordering rule.

Test old clients during a compatibility window.

Rollback

Dual-read the old and new schema; feature-flag new writes. Preserve fields when reverting. Do not transform all records destructively.

First-user disposition: Blocks cross-device sync. Web-only release still requires multi-session conflict tests.

BR-012 — Reader state updates can silently lose concurrent changes

Severity: P0
Status at baseline: Open
Affected users/data: Profile, settings, reader state
Gate: G5

Repository evidence

db/schema.ts:36-41 stores one raw JSON state row per user.

app/api/state/route.ts:25-54 parses, merges, and writes state without a version, ETag, compare-and-swap, transaction guard, or explicit body/schema limit.

External evidence

OWASP REST Security: https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html

Zotero data synchronization context: https://www.zotero.org/support/sync

Likely failure mode

Two tabs or devices read the same state and each writes a different change; the later full-row write silently removes the other change. Large or malformed JSON also consumes resources.

Smallest safe fix

Validate an explicit schema and size cap, add server revision/ETag, require conditional update, and return a 409 conflict with mergeable server state. Prefer field-level patches for independent settings.

Acceptance test

Two clients update different fields from the same revision.

The stale write must not silently overwrite the newer revision.

Invalid/oversized JSON is rejected before D1 mutation.

Unknown future fields survive compatible clients.

Retry after conflict produces the intended merged state.

Rollback

Continue serving the prior read shape while gating writes behind compatibility handling. Do not discard stored state to recover.

First-user disposition: Blocks multi-device state sync.

BR-013 — Origin, CSRF, and trusted-header boundary is unproven

Severity: P0
Status at baseline: Open/unverified
Affected users/data: All authenticated cloud data and device credentials
Gate: G2

Repository evidence

app/chatgpt-auth.ts:15-32 trusts oai-authenticated-user-id and email headers.

app/chatgpt-auth.ts:35-46 includes a development bypass.

State-changing routes do not contain a common Origin/Referer or CSRF check.

worker/index.ts:31-48 contains image optimization wrapping but no visible security middleware.

next.config.ts:1-5 contains no header policy.

External evidence

OWASP CSRF Prevention: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html

OWASP REST Security: https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html

Likely failure mode

If identity headers are accepted outside the intended edge or cross-site authenticated requests are permitted, an attacker can mutate books, state, devices, or AI budget.

Smallest safe fix

Verify and document the edge trust contract; strip/overwrite identity headers before application ingress; fail closed outside the platform; enforce same-origin/Origin validation or an anti-CSRF token for browser mutations; restrict CORS; make development bypass impossible in production.

Acceptance test

Direct public request with forged oai-* headers is rejected.

Cross-origin form/fetch mutation fails.

Unsupported Origin and null Origin fail where appropriate.

Development bypass cannot activate in Beta/public builds.

Signed-out and malformed bearer requests fail consistently.

Live response headers and cookie/auth behavior are captured.

Rollback

Disable cloud mutations or require device/API authentication until the platform boundary is understood. Revert a new CSRF mechanism only to another fail-closed control.

First-user disposition: Blocks all public mutations.

BR-014 — No complete account export and erasure workflow

Severity: P0
Status at baseline: Open
Affected users/data: All cloud and local user records
Gate: G6

Repository evidence

No account-level export or erase route was found.

Deletion routes remove individual books but not all account data.

db/schema.ts contains books, progress, tombstones, state, and devices requiring coordinated handling.

R2 contains user-prefixed EPUB objects.

Browser local data spans IndexedDB and localStorage.

docs/product-roadmap.md:19-29,39-45 identifies export as unfinished and rejects lock-in before export.

External evidence

Zotero data backup/export principles: https://www.zotero.org/support/zotero_data

Zotero sync distinction: https://www.zotero.org/support/sync

Likely failure mode

A user cannot retrieve a complete record or terminate use without residual books, progress, devices, tombstones, local evidence, or provider-side ambiguity.

Smallest safe fix

Create a versioned export manifest and idempotent erasure workflow. Cover D1 rows, R2 objects, devices, settings, progress, tombstones, and local-clear guidance/control. Define backup/log retention exceptions honestly.

Acceptance test

Export a synthetic account and enumerate every schema/resource category.

Validate hashes and machine-readable metadata.

Erase the account, revoke all devices, and prove covered D1/R2 records are gone.

Re-run erasure safely.

Prove another account remains unchanged.

Explain residual backup/log retention and expiry.

Verify local clear separately.

Rollback

Before the destructive checkpoint, cancel safely. After confirmed erasure, do not silently restore. Recovery requires an explicit authorized request and a policy-compatible backup.

First-user disposition: Blocks the first external user.

BR-015 — Privacy, copyright, provider, and storage disclosures are incomplete

Severity: P0
Status at baseline: Open
Affected users/data: Identity, books, reading history, selected text, search queries
Gate: G6

Repository evidence

No complete privacy notice, terms/acceptable-use statement, or account-deletion explanation was found.

docs/reader-mvp.md:40-46 says a book file remains local and selected text is bounded, but current Web code cloud-syncs EPUB files and chat can transmit broader context/history.

src/server/ai.ts sends selected text/context/title to an external AI provider.

src/server/webSearch.ts can use Brave or Wikipedia.

src/lib/publication.ts:22-33 classifies PDF as local-only while EPUB is cloud-eligible.

README.md publishes the live product URL.

External evidence

OpenAI Privacy Policy: https://openai.com/policies/privacy-policy/

Brave Search API documentation: https://api.search.brave.com/app/documentation/web-search/get-started

MediaWiki REST API: https://www.mediawiki.org/wiki/API:REST_API

EPUB 3.3: https://www.w3.org/TR/epub-33/

Likely failure mode

The user uploads copyrighted/private EPUBs or sends text to AI/search without understanding storage, recipients, retention, deletion, or the local/cloud distinction.

Smallest safe fix

Publish a concise, product-specific notice covering identity headers, EPUB cloud storage, PDF/local evidence, AI provider and transmitted fields, search providers, retention, export, deletion, security contact, and user responsibility for imported content. Correct stale docs.

Acceptance test

A reviewer can map every data-flow arrow in the readiness report to a disclosure. UI presents material notice before first upload/AI/search use. Text matches actual provider/environment configuration and deletion behavior.

Rollback

Remove external invitations and disable the inaccurately described feature until disclosure matches behavior. Revert notice text only alongside behavior or a corrected notice.

First-user disposition: Blocks the first external user.

BR-016 — No sufficient redacted observability and alerting

Severity: P0
Status at baseline: Open
Affected users/data: Reliability, incident detection, potentially private reading content
Gate: G7

Repository evidence

app/api/rewrite/route.ts and app/api/chat/route.ts use raw console.error paths.

No common request ID, structured event schema, redaction policy, route latency/error metrics, storage reconciliation metrics, AI-cost metrics, or alert definitions were found.

app/api/health/route.ts reports configuration state but is not an operational telemetry system.

External evidence

OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html

NIST SP 800-61r3: https://csrc.nist.gov/pubs/sp/800/61/r3/final

Likely failure mode

The operator cannot detect a cross-account denial pattern, AI spend spike, orphan accumulation, migration failure, or elevated error rate. Conversely, ad hoc debugging may leak selected text, titles, tokens, or provider responses.

Smallest safe fix

Add structured redacted events with request/correlation ID, environment, route, status, latency, error class, quota outcome, operation ID, and non-secret user/device pseudonym. Add alerts for error, auth, cost, storage, and reconciliation anomalies.

Acceptance test

Trigger representative errors and prove alerts fire.

Automated log assertions reject selected text, context, title, file bytes, bearer token, API key, email, and raw provider body.

Trace one failed operation across API and reconciliation using non-secret IDs.

Prove Beta/public telemetry is separated.

Rollback

Reduce or disable optional telemetry fields. Retain minimum error and security signals. Never “fix” logging by adding raw content.

First-user disposition: Blocks the first external user.

BR-017 — No incident, revocation, and recovery runbook

Severity: P0
Status at baseline: Open
Affected users/data: All user data and availability
Gate: G7

Repository evidence

SECURITY.md:3-17 provides vulnerability-reporting and general deployer duties.

No product incident severity model, contact tree, containment checklist, user communication template, secret/device revocation drill, data-integrity reconciliation procedure, or post-incident review was found.

External evidence

NIST SP 800-61r3: https://csrc.nist.gov/pubs/sp/800/61/r3/final

OWASP Secrets Management: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html

Likely failure mode

During a token leak, wrong deployment, provider-key compromise, D1 corruption, or R2 inconsistency, the operator improvises and either delays containment or destroys evidence/data.

Smallest safe fix

Write a one-page small-team incident runbook for detection, triage, containment, credential rotation, feature disablement, rollback, restore, reconciliation, user communication, evidence retention, and postmortem ownership.

Acceptance test

Run table-top drills for:

device token disclosure;

AI/search key disclosure;

wrong-project deployment;

destructive migration;

partial R2/D1 deletion;

suspected cross-tenant access.

Record decisions, contacts, commands/control-plane steps, user-notification threshold, and recovery evidence.

Rollback

The runbook itself is versioned documentation. Revert only to an earlier reviewed version; operational rollback follows BR-002/BR-004.

First-user disposition: Blocks the first external user.

BR-018 — AI data, attribution, fallback, and cost boundaries are incomplete

Severity: P1
Status at baseline: Open
Affected users/data: Selected text, context, title, chat history, provider cost
Gate: G6, G8

Repository evidence

src/server/ai.ts:105-161 bounds selected text and surrounding context for rewrite.

src/server/ai.ts:181-255 can send selected text, larger context, up to ten messages, title, and optional web-search material for chat.

src/server/ai.ts:50-69 selects provider/base/model from environment.

No per-user cost budget, explicit pre-send field disclosure, model-output provenance indicator, prompt-injection test, or provider-specific retention notice was found.

External evidence

OWASP API4:2023: https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/

OpenAI Privacy Policy: https://openai.com/policies/privacy-policy/

The OpenAI policy is relevant only when an OpenAI service processes data; the current configured provider must be disclosed independently.

Likely failure mode

A user assumes only the highlighted word is sent while context/history/title also leave the device. A provider outage or hallucination is presented without clear status, or AI use creates uncontrolled cost.

Smallest safe fix

Show a concise first-use disclosure, enumerate transmitted fields, identify the active provider/model at a suitable level, enforce budgets/timeouts/cancellation, label model/search sources, and preserve a non-AI reading path.

Acceptance test

Network-level test verifies only documented fields are transmitted.

Full book content is never sent by default.

Budget, timeout, cancellation, malformed provider response, and provider outage produce recoverable states.

AI can be disabled independently.

Prompt-injection fixtures do not cause unauthorized data retrieval or tool behavior.

Rollback

Disable AI routes and hide/disable assistance actions while preserving reading, highlights, and progress.

First-user disposition: Blocks AI unless completed; does not block a reading-only invite if AI is provably disabled.

BR-019 — Search configuration and Wikipedia fallback are misrepresented

Severity: P1
Status at baseline: Open
Affected users/data: Search queries, result provenance, user trust
Gate: G6, G8

Repository evidence

src/server/webSearch.ts:27-39 looks up Brave configuration.

src/server/webSearch.ts:41-64 calls Brave when configured.

src/server/webSearch.ts:81-109 uses Wikipedia otherwise.

webSearchConfigured() returns true regardless of Brave-key presence.

app/api/health/route.ts:5-16 can therefore report search as configured without distinguishing provider/fallback.

External evidence

Brave Search API documentation: https://api.search.brave.com/app/documentation/web-search/get-started

MediaWiki REST API: https://www.mediawiki.org/wiki/API:REST_API

Likely failure mode

The user or operator believes Brave search is configured when requests are sent to Wikipedia, or believes web search occurred when the fallback failed. Query disclosure and result scope are unclear.

Smallest safe fix

Return an explicit state: brave, wikipedia, or disabled; disclose the provider in UI and telemetry; treat fallback failure as unavailable rather than fabricated search.

Acceptance test

Run with Brave key, without key, and with both providers unavailable.

Health and UI show the correct state.

Network captures match the declared provider.

Result citations identify source URLs.

No-search mode does not claim external verification.

Rollback

Force search to disabled; continue AI without search only when clearly labeled.

First-user disposition: Blocks search unless fixed or disabled.

BR-020 — Browser-local PDF/evidence lifecycle is incomplete

Severity: P1
Status at baseline: Open
Affected users/data: Local PDF files, selected text, explanations, progress, highlights
Gate: G6

Repository evidence

src/lib/bookStore.ts:4-24,43-56,122-176 stores source blobs and publication metadata in IndexedDB.

src/lib/readingEvidence.ts stores selected text, context, explanations, and reading behavior in IndexedDB.

src/lib/pdfHighlights.ts:26-27,132-165,197-200 uses localStorage sidecars/quarantine/delete.

src/lib/pdfLocator.ts:51-69 stores progress in localStorage.

src/lib/bookDeletion.ts:3-43 manages local tombstones and deletion.

No unified local export/clear operation covering all stores was found.

External evidence

OWASP HTML5 Security: https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html

MDN IndexedDB overview: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API

Likely failure mode

On a shared browser profile, another person can access private PDFs or reading evidence. A user deletes a book but residual highlights, locators, evidence, or tombstones remain.

Smallest safe fix

Inventory every local key/store; add per-book and all-local-data export/clear functions; show storage scope; clear dependent records transactionally where possible; test browser-profile behavior.

Acceptance test

Import a PDF, generate progress/highlights/evidence, export, then clear.

Verify no matching blob, metadata, locator, highlight, evidence, cache, or tombstone remains.

Verify another book remains intact for per-book deletion.

Verify clear-all is explicit and confirmable.

Test supported browsers.

Rollback

Never auto-delete by default. If clear logic is uncertain, disable it and provide accurate manual instructions until fixed.

First-user disposition: Blocks local PDF/evidence use unless disclosure and minimum clear controls are complete.

BR-021 — Security headers and sensitive cache policy are incomplete

Severity: P1
Status at baseline: Open/unverified
Affected users/data: Sessions, EPUB files, selected text, UI integrity
Gate: G2, G8

Repository evidence

next.config.ts:1-5 defines no security headers.

worker/index.ts:31-48 defines no visible common header middleware.

app/api/books/[id]/file/route.ts:7-22 returns a private response with max-age=300.

No repository CSP, frame-ancestors, nosniff, Referrer-Policy, Permissions-Policy, or explicit no-store policy for sensitive JSON was found.

Live edge headers were not inspected.

External evidence

OWASP Secure Headers: https://owasp.org/www-project-secure-headers/

MDN CSP: https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP

MDN Cache-Control: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control

Likely failure mode

Injected or embedded content executes with excessive capability; private responses are cached incorrectly; referrers or MIME sniffing expose information; framing enables unwanted UI embedding.

Smallest safe fix

Define route-appropriate headers. Start CSP in report-only mode, then enforce. Set sensitive API JSON to no-store; verify EPUB cache keys and private caching at the edge; add MIME, framing, referrer, and permissions controls.

Acceptance test

Capture live headers for HTML, API JSON, EPUB download, static assets, and errors. Test CSP violations, framing, MIME sniffing, cross-user cache isolation, browser back/forward behavior, and no-store on sensitive routes.

Rollback

Return CSP to report-only while fixing breakage. Keep no-store/private-cache and MIME protections unless a reviewed alternative exists.

First-user disposition: Minimum header/cache subset blocks the invite.

BR-022 — First-run, offline, failure, and support states are incomplete

Severity: P1
Status at baseline: Open
Affected users/data: First external user experience and recoverability
Gate: G8

Repository evidence

Product code contains reader/import flows, but no complete acceptance evidence was found for signed-out, empty, offline, quota, provider failure, corrupt upload, partial delete, restore, or account-erasure states.

docs/product-roadmap.md:3-29 identifies reliability, conflict visualization, offline queueing, VoiceOver, and export work.

No in-product support/contact contract was found.

External evidence

WCAG 2.2: https://www.w3.org/TR/WCAG22/

Comparator operational UX: https://www.audiobookshelf.org/docs/

Likely failure mode

The first user cannot distinguish local/cloud, retry safely, or recover without sending private content to the owner.

Smallest safe fix

Complete a bounded first-user state matrix with explicit next actions, idempotent retries, non-destructive errors, support contact, and privacy-safe diagnostic export.

Acceptance test

A tester completes every cloud UI smoke scenario in the readiness report without database access or owner intervention. Error messages do not expose provider internals, credentials, or content.

Rollback

Hide or disable the incomplete action and preserve a safe reading path. Route support to a documented contact.

First-user disposition: Basic first-run, failure, and support states block the invite.

BR-023 — Accessibility acceptance is incomplete

Severity: P1
Status at baseline: Open
Affected users/data: Keyboard, low-vision, screen-reader, motor, and iOS accessibility users
Gate: G8

Repository evidence

docs/product-roadmap.md:19-29 lists VoiceOver and accessibility work as unfinished.

No complete Web keyboard/screen-reader/zoom/reflow acceptance record or iOS VoiceOver test evidence was found.

EPUB/PDF/selection surfaces have distinct interaction stacks requiring separate checks.

External evidence

WCAG 2.2: https://www.w3.org/TR/WCAG22/

EPUB Accessibility 1.1: https://www.w3.org/TR/epub-a11y-11/

EPUB Reading Systems 3.3: https://www.w3.org/TR/epub-rs-33/

Likely failure mode

Interactive controls are unreachable, focus is lost, selection assistance traps input, reflow breaks at zoom, or publication accessibility metadata/structure is not exposed.

Smallest safe fix

Define a minimum test matrix for keyboard, focus, contrast, 200% zoom, text spacing, reduced motion, screen reader, touch targets, selection UI, EPUB navigation, and iOS VoiceOver.

Acceptance test

Complete core reading/import/delete/AI flows by keyboard.

Verify visible focus and logical order.

Verify 200% zoom and text-spacing without loss of function.

Run a supported Web screen reader and iOS VoiceOver.

Test reduced motion and touch targets.

Record known EPUB/PDF limitations.

Rollback

Provide an accessible fallback or disable the inaccessible optional surface. Do not suppress native selection/accessibility APIs to preserve styling.

First-user disposition: Minimum keyboard, focus, zoom, and screen-reader smoke blocks the invite. Broader conformance remains P1.

BR-024 — Large, corrupt, and media-heavy publication limits are insufficiently proven

Severity: P1
Status at baseline: Open
Affected users/data: Availability, browser memory, import reliability
Gate: G4, G8

Repository evidence

Cloud EPUB upload permits 40 MiB compressed files.

src/lib/bookStore.ts stores local source blobs.

PDF and EPUB parsing/rendering occur in browser paths.

app/api/books/route.ts:95-114 can download and hash a legacy R2 object in a request.

README.md and src/lib/epubMedia.ts indicate embedded media handling.

No representative resource/performance acceptance corpus or server expanded-size limits were found.

External evidence

OWASP File Upload: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html

Workers limits: https://developers.cloudflare.com/workers/platform/limits/

EPUB Reading Systems 3.3: https://www.w3.org/TR/epub-rs-33/

Likely failure mode

A compressed archive expands far beyond its upload size, a parser hangs, a large PDF exhausts browser memory, media continues consuming resources, or request-time legacy hashing exceeds platform limits.

Smallest safe fix

Set compressed/expanded/entry/resource limits, cancellation/timeouts, bounded background hashing/reconciliation, and a representative test corpus for small/large/corrupt/media-heavy publications.

Acceptance test

Test at least:

small valid EPUB;

near-limit valid EPUB;

excessive expansion ratio;

excessive entry count;

malformed spine/package;

media-heavy EPUB;

small and large scholarly PDF;

corrupt/truncated PDF;

cancellation and retry;

low-memory/browser-tab recovery.

Record load time, peak memory where available, timeout behavior, and user-facing failure state.

Rollback

Reduce limits, disable embedded media, or move expensive reconciliation out of request paths. Preserve local access to already valid books.

First-user disposition: Blocks unsupported exposed cases; a narrower documented file policy may ship after tests.

BR-025 — iOS hard-codes the public endpoint

Severity: P1
Status at baseline: Open
Affected users/data: Beta/public books, progress, settings, device tokens
Gate: G1, G5

Repository evidence

ios/DawnReader/DawnReader/DawnSyncClient.swift:85-86 hard-codes the public Dawn Reader URL.

ios/DawnReader/DawnReader/DawnSyncClient.swift:238-267 sends bearer-token requests to that endpoint.

docs/development-workflow.md:41-50 states Web evidence does not prove iOS and no macOS/Xcode CI/TestFlight path exists.

External evidence

GitHub Actions security hardening: https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions

Apple platform security/Keychain context: https://support.apple.com/guide/security/keychain-data-protection-secb0694df1a/web

Likely failure mode

A Beta iOS build writes owner experiments or test progress directly to public. The operator cannot prove which backend a signed build uses.

Smallest safe fix

Use signed build configuration for Debug, owner-only Beta, and Public, with endpoint/audience visibly reportable. Prevent production builds from targeting Beta and Beta builds from targeting public.

Acceptance test

Inspect signed build settings.

Beta build reaches only Beta resources.

Public build reaches only public resources.

Deliberately swapped configuration fails CI or runtime preflight.

Diagnostics display non-secret environment identity.

Rollback

Exclude iOS from the first-user scope, revoke pairing tokens, and disable pairing UI/API until environment targeting is fixed.

First-user disposition: Blocks iOS participation, not a provably Web-only invite.

BR-026 — iOS disconnect, account switch, and purge semantics are incomplete

Severity: P1
Status at baseline: Open
Affected users/data: Local books, sync token, API key, account boundaries
Gate: G5, G6

Repository evidence

ios/DawnReader/DawnReader/SettingsStore.swift:106-107,135-165 stores API key and sync code in Keychain and clears local sync code on disconnect.

ios/DawnReader/DawnReader/KeychainStore.swift provides Keychain access.

ios/DawnReader/DawnReader/LibraryModel.swift:393-402 stores books in Application Support.

ios/DawnReader/DawnReader/AIClient.swift:214-231 calls an external Qwen/Alibaba-compatible endpoint directly.

No complete server-revoke/local-retain/local-delete/account-switch acceptance contract was found.

External evidence

Apple Keychain data protection: https://support.apple.com/guide/security/keychain-data-protection-secb0694df1a/web

OWASP Secrets Management: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html

Likely failure mode

Disconnect removes only a local reference while the server token remains valid; account switching exposes prior local books; users cannot distinguish deleting a token from deleting content or API credentials.

Smallest safe fix

Define separate actions for server revoke, disconnect, remove local sync token, remove local books/evidence, and remove AI key. Namespace local content by account/environment and review Keychain accessibility class.

Acceptance test

Disconnect with and without server revocation.

Verify revoked token fails.

Switch accounts and environments without cross-visible books/settings.

Test retain-local and delete-local choices.

Verify AI key removal is independent and complete.

Reinstall/restore behavior is documented.

Rollback

Disable account switching and remote purge; retain local data by default with accurate instructions. Revoke affected server tokens.

First-user disposition: Blocks iOS use.

BR-027 — CI omits migration, destructive cloud, deployment, and iOS checks

Severity: P1
Status at baseline: Open
Affected users/data: Release correctness across all surfaces
Gate: G0, G3, G9

Repository evidence

.github/workflows/ci.yml:1-24 runs npm ci, tests, build, and high-severity audit on Ubuntu.

.github/workflows/codeql.yml:1-24 scans JavaScript/TypeScript.

No migration compatibility, API contract, disposable D1/R2, deployment smoke, rollback, macOS/Xcode, or iOS tests were found.

docs/development-workflow.md:41-50 acknowledges the Web/iOS evidence gap.

External evidence

GitHub Actions security hardening: https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions

GitHub rulesets: https://docs.github.com/en/repositories/configuring-branches-and-merges/in-your-repository/managing-rulesets/about-rulesets

Likely failure mode

A PR is green while breaking migration compatibility, edge auth, D1/R2 consistency, deployment targeting, or iOS protocol compatibility.

Smallest safe fix

Add required migration/API contract tests, destructive tests against disposable resources, release-manifest validation, post-deploy smoke, and iOS build/tests when iOS is in scope.

Acceptance test

A deliberately broken migration, tenant check, progress contract, environment ID, rollback target, and iOS build each fail the intended required check. Core required checks cannot be bypassed without recorded owner action.

Rollback

A flaky non-security test may be temporarily non-gating only with an owner, issue, and replacement evidence. Tenant, migration, provenance, and restore checks remain gating.

First-user disposition: Core cloud subset blocks the invite; iOS CI blocks only when iOS is offered.

BR-028 — Workflow dependencies and release artifacts lack strong provenance

Severity: P1
Status at baseline: Open
Affected users/data: Build integrity and deployment trust
Gate: G0, G9

Repository evidence

.github/workflows/ci.yml and codeql.yml reference actions by major version tags such as @v4.

No least-privilege workflow permission review, artifact attestation, SBOM, or signed release manifest was found.

No deployment workflow records immutable artifact identity.

External evidence

GitHub Actions hardening: https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions

GitHub artifact attestations: https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations

GitHub dependency review: https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/about-dependency-review

Likely failure mode

A mutable third-party action or ambiguous artifact changes build behavior, while the operator cannot prove what was deployed.

Smallest safe fix

Pin actions to reviewed full SHAs, minimize workflow permissions, generate checksums/attestation and release manifest, and retain the accepted artifact.

Acceptance test

Workflow action refs are immutable SHAs with update metadata.

Default token permissions are read-only except explicit jobs.

Artifact hash and attestation verify before deploy.

Tampered artifact or manifest fails promotion.

Rollback

Revert a problematic pinned action to the previously reviewed SHA. Do not return to an unpinned tag as the normal state.

First-user disposition: BR-002 provides the immediate blocker; complete this before broader production and preferably before invite.

BR-029 — Dependency, SwiftPM, license, and update governance is incomplete

Severity: P1
Status at baseline: Open
Affected users/data: Supply-chain risk, licensing, build continuity
Gate: G0

Repository evidence

.github/dependabot.yml:1-14 covers npm weekly and GitHub Actions monthly.

No SwiftPM update automation or iOS dependency review was found.

No complete SBOM, third-party notice/license inventory, vulnerability-response threshold, or compatibility update policy was found.

External evidence

GitHub dependency review: https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/about-dependency-review

GitHub supply-chain security guidance: https://docs.github.com/en/code-security/supply-chain-security

Likely failure mode

An iOS or transitive dependency remains vulnerable or incompatible; a license obligation is missed; automated upgrades merge without reader regression review.

Smallest safe fix

Inventory npm and SwiftPM dependencies/licenses, add dependency review, define critical-update handling, monitor SwiftPM changes, and require reader/protocol regression checks.

Acceptance test

Generate dependency and license inventories for Web and iOS.

Introduce a test dependency change and verify review detects it.

Confirm critical advisory ownership and disable/rollback path.

Verify lockfiles are reviewed and reproducible.

Rollback

Restore the previous lockfile/package resolution and disable the affected feature if necessary. Preserve advisory evidence.

First-user disposition: Conditional. Known critical issues or unknown production dependencies block; otherwise complete during controlled Beta.

BR-030 — EPUB embedded/remote content policy is incomplete

Severity: P2
Status at baseline: Open/unverified
Affected users/data: Reader privacy, network disclosure, UI integrity, copyright
Gate: G2, G6, G8

Repository evidence

README.md describes embedded media support.

src/lib/epubMedia.ts parses or adapts EPUB media.

Reader content configuration exists in src/components/Reader.tsx.

No comprehensive server/client policy was found for remote URLs, scripts, iframes, forms, trackers, referrers, cookies, or publication-origin isolation.

External evidence

EPUB Reading Systems 3.3: https://www.w3.org/TR/epub-rs-33/

EPUB 3.3: https://www.w3.org/TR/epub-33/

MDN CSP: https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP

OWASP File Upload: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html

Likely failure mode

Opening an imported EPUB contacts a remote host, discloses reading behavior/IP/referrer, executes active content, or breaks the application origin boundary.

Smallest safe fix

Default-deny remote/active publication content unless explicitly supported. Sanitize or sandbox publication contexts, constrain network/media domains, suppress credentials/referrers, and disclose any user-enabled remote load.

Acceptance test

Use fixtures with remote image, audio, video, iframe, script, form, navigation, and tracker URLs. Verify the documented allow/block policy in every reader surface and theme. Verify no authenticated cookies or sensitive referrer is sent.

Rollback

Disable remote media/active content globally while retaining text and packaged local resources.

First-user disposition: Remote/active content must be disabled if policy remains unverified.

BR-031 — User support and operational ownership are underspecified

Severity: P2
Status at baseline: Open
Affected users/data: Incident reporting, recovery, user trust
Gate: G7, G8

Repository evidence

SECURITY.md provides a vulnerability-reporting route but not ordinary user support.

No in-product support/contact, status communication, privacy-safe diagnostic export, escalation owner, or response policy was found.

External evidence

NIST SP 800-61r3: https://csrc.nist.gov/pubs/sp/800/61/r3/final

Audiobookshelf documentation as comparator: https://www.audiobookshelf.org/docs/

Likely failure mode

The first user sends private book text, screenshots, or credentials through an unsuitable channel, or receives no response during data loss.

Smallest safe fix

Add one support route, one security route, a privacy warning, a diagnostic bundle without content, severity ownership, and an incident-status communication path.

Acceptance test

A tester reports an import failure and a suspected security issue without attaching book text or a token. The owner can correlate the report by request/operation ID and follow the documented escalation.

Rollback

Route all reports to a single controlled contact and disable diagnostic upload. Do not solicit raw EPUBs or credentials.

First-user disposition: A basic support/security contact is required before invite; richer support maturity may follow.

BR-032 — Retention and stale-record cleanup are undefined

Severity: P2
Status at baseline: Open
Affected users/data: Tombstones, revoked/stale devices, logs, backup/export artifacts, orphan objects
Gate: G6, G7

Repository evidence

db/schema.ts:28-34 stores deletion tombstones without a retention field.

db/schema.ts:43-53 stores revoked/stale device records without cleanup policy.

src/lib/bookDeletion.ts retains local deletion tombstones.

No log, backup, export-artifact, orphan, or stale-device retention schedule was found.

External evidence

R2 object lifecycle controls: https://developers.cloudflare.com/r2/buckets/object-lifecycles/

OWASP Logging: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html

Likely failure mode

Sensitive operational records persist indefinitely, or an aggressive cleanup removes deletion barriers and causes book resurrection.

Smallest safe fix

Define purpose-based retention for each record class. Implement dry-run cleanup with environment and tenant checks. Preserve tombstones as long as required by sync semantics, then compact only under a protocol-safe rule.

Acceptance test

Produce a retention inventory.

Seed records at boundary ages.

Run dry-run and apply modes.

Prove active devices/current tombstones are preserved.

Prove expired logs/exports/orphans are removed.

Re-run without additional deletion.

Verify recovery/backup exceptions are disclosed.

Rollback

Disable cleanup and restore incorrectly removed operational metadata from backup when appropriate. Do not restore user content after an erasure request without explicit authority.

First-user disposition: May follow during controlled Beta if an interim retention policy is documented and no automatic destructive cleanup runs.
