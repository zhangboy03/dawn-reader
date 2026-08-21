Dawn Reader — First-External-User Beta Readiness Audit

Audit date: 2026-08-21
Task class: Research
Repository baseline: adf73dda00a45762b3baacb961d20f10bada415e
Repository packet SHA-256: 319671e035517d752b0a1d4f607624332c827cc899c227dbf800b6c28df53728
Reviewed packet: 186 tracked files, 5,065,495 bytes, 187 archive entries
Secret-pattern scan supplied with packet: no-pattern-match
Primary decision: NO-SHIP for the first external user
Owner-only Beta decision: Conditional GO only after an isolated, owner-only Beta environment and recoverable deployment path are demonstrated

1. Executive judgment

Dawn Reader has credible foundations:

D1 records are generally tenant-scoped by userId.

R2 EPUB object keys are namespaced by user.

Device tokens are random, stored as SHA-256 hashes, and revocable.

PDF files remain local in browser IndexedDB rather than being uploaded to the current cloud book path.

EPUB uploads have a 40 MiB compressed-size limit.

Deletion tombstones reduce accidental resurrection during sync.

GitHub CI and CodeQL were reported green at the reviewed baseline.

The reviewed packet’s secret-pattern scan found no pattern match.

Those foundations do not establish first-external-user readiness. The unresolved risk is not merely unfinished polish. The current repository does not prove:

that owner-only Beta and public production are separate deployment, identity, D1, R2, secret, and operational domains;

that an exact revision tested on Beta can be promoted to public without rebuilding or silently targeting the wrong Sites project;

that public data can be restored after migration, deployment, deletion, or multi-store failure;

that unauthenticated, cross-origin, abusive, conflicting, or malformed requests are bounded;

that the user can understand, export, and erase cloud and local data;

that Web and iOS cannot overwrite one another’s reading locators;

that an incident can be detected, contained, rolled back, and explained.

The first external user must not be invited until G0–G9 pass, subject to explicit scope-based exceptions noted below.

2. Bilateral ship judgment
2.1 Strongest case for launching quickly

A tightly controlled owner-only Beta can produce useful daily-use evidence because the repository already has tenant-prefixed storage, tenant-filtered API reads, hashed device tokens, local-only PDF handling, bounded EPUB upload size, deletion tombstones, automated Web tests, and CodeQL. With isolated disposable Beta data, manual monitoring, AI and device pairing capable of being disabled, and no external user promise, failures remain comparatively recoverable.

The public site could also support one technically sophisticated test account under direct supervision if all data were synthetic and disposable. That is not the requested first-external-user standard because a real user will reasonably treat uploaded books, progress, settings, and reading evidence as durable and private.

2.2 Strongest case for delaying

The repository currently contains a fixed Sites project identifier that is copied into the build, no repository-owned promotion or rollback workflow, runtime DDL, no demonstrated D1/R2 restore drill, no per-user storage quota, no AI request budget, non-atomic R2/D1 mutations, client-clock last-write-wins sync, mutually destructive Web/iOS locator writes, unbounded state replacement, no complete user export/erasure path, no product privacy notice, limited operational telemetry, and a hard-coded iOS public URL.

A single failed mutation can leave a book object, metadata row, progress row, or tombstone inconsistent. A Web progress update can null the native locator, while an iOS update can null the Web CFI. A compromised or accidentally disclosed device token has no expiry or scope. A public AI route has no demonstrated per-user budget. A bad migration or deployment has no proven exact-version rollback and restore procedure.

2.3 Decision and evidence that would change it

Current decision: NO-SHIP for the first external user.

The decision changes to SHIP only when evidence demonstrates:

two independent Sites projects or an equivalently strong platform-enforced environment boundary;

independent Beta/public D1, R2, secrets, auth audience/domain, logs, and operator access;

an exact mapping from source SHA to artifact hash, configuration hash, Beta deployment ID, and public deployment ID;

successful migration compatibility and disposable-environment restore drills;

enforced route/body/storage/AI/device quotas and origin protections;

fault-injected upload/delete reconciliation;

conflict-safe Web/iOS progress semantics;

device revocation and account erasure drills;

accurate privacy, AI, search, local-storage, deletion, and support disclosures;

live-header, signed-out, two-account, rollback, and first-user smoke evidence;

closure of every applicable G0–G9 gate.

3. Evidence boundary
3.1 Directly established

The packet hash and baseline commit identify the reviewed tracked tree.

The packet contains the repository paths cited in this audit.

Repository code and documentation establish the static behavior described here.

The original mission supplied that main CI and CodeQL were green at the baseline.

The original mission supplied that an active public Sites project exists, has owner access, a live URL, D1 binding DB, R2 binding BOOKS, and no separate preview URL.

3.2 Not established

No live deployment, Sites console, database, bucket, secret, user account, browser storage, CDN response, or iOS build was accessed.

No deploy, migration, restore, deletion, token-revocation, two-account, or rollback drill was performed against live resources.

The exact Sites control-plane capabilities for private access, target-project override, deployment versions, artifact reuse, and rollback were not proven.

Cloudflare Workers/D1/R2 documentation is used as relevant underlying-service practice, not as proof that every control is exposed through Sites.

A later local npm test attempt did not establish a result because installed dependencies were absent and vitest could not be invoked. This is not treated as a product test failure or a pass.

Legal obligations depend on operator location, user location, service terms, and processing details not supplied. This report defines minimum product disclosures and operational controls, not jurisdiction-specific legal advice.

4. Architecture and trust boundaries
4.1 Principal data flows
[ChatGPT-authenticated browser]
        |
        | trusted identity headers at platform edge
        v
[Sites / Next application]
        |
        +--> [D1: accounts-by-header identity, books, progress,
        |     settings/state, tombstones, devices]
        |
        +--> [R2: user-prefixed EPUB objects]
        |
        +--> [Configured AI provider]
        |       selected text, bounded surrounding context,
        |       conversation history, book title
        |
        +--> [Brave Search when configured]
        |       search query
        |
        +--> [Wikipedia REST fallback]
                search query


[Browser local storage]
        +--> IndexedDB: EPUB/PDF source blobs and metadata
        +--> IndexedDB: reading evidence and selected text
        +--> localStorage: profile, notes, PDF progress,
             PDF highlights, deletion tombstones


[iOS application]
        |
        +--> hard-coded public Dawn Reader URL
        |       bearer device token, books, state, progress
        |
        +--> Alibaba/Qwen-compatible endpoint
                user API key from Keychain, selected text/context
4.2 Assets requiring protection
Asset	Location	Primary risks
User identity and email	Trusted request headers; application context	Spoofing outside expected edge, accidental logging, environment crossover
EPUB files	R2	Cross-tenant access, copyright exposure, orphaned objects, unrecoverable deletion
Book metadata and reading progress	D1	Tenant crossover, clock conflicts, destructive migration, incomplete erasure
Device tokens	Client and D1 token hash	Token theft, indefinite use, unbounded creation, weak lifecycle
Selected text and AI context	Browser, API, external AI provider	Unexpected disclosure, retention ambiguity, prompt injection, excessive cost
Search queries	Brave or Wikipedia	Disclosure to third party, incorrect “configured” state
PDF files and evidence	Browser IndexedDB/localStorage	Shared-device exposure, incomplete local deletion, no export
Deployment identity	Git, artifact, Sites project/version	Wrong-project deployment, unverifiable promotion, ineffective rollback
Backups and logs	Platform/operator systems	Sensitive-content leakage, stale data, inaccessible restore
4.3 Critical trust boundaries

ChatGPT/platform edge to application identity headers.

Authenticated browser to every mutation route.

Application to D1 and R2.

Application to AI and search providers.

Web local storage to other users of the same browser profile.

iOS device token to the public API.

Owner-only Beta to public production.

Source commit to build artifact, environment configuration, deployment, and rollback target.

5. Repository and API coverage
5.1 Product/security surface coverage
Surface	Inspected evidence
Sites project and bindings	.openai/hosting.json:1-5; build/sites-vite-plugin.ts:15-32; vite.config.ts:3-20,23-42
GitHub CI and CodeQL	.github/workflows/ci.yml:1-24; .github/workflows/codeql.yml:1-24; .github/dependabot.yml:1-14
Request entry point	worker/index.ts:31-48; next.config.ts:1-5
ChatGPT/session identity	app/chatgpt-auth.ts:15-46
Device bearer authentication	app/chatgpt-auth.ts:49-71; src/server/deviceAuth.ts:1-36
D1 schema	db/schema.ts:3-53
Runtime schema behavior	db/index.ts:13-31
Migrations	drizzle/0000_ambiguous_joseph.sql; drizzle/0001_military_silver_samurai.sql; drizzle/0002_nosy_whizzer.sql
R2 keying and book merge	src/server/library.ts:5-50
Book upload/list/delete/download	app/api/books/route.ts; app/api/books/[id]/route.ts; app/api/books/[id]/file/route.ts; src/server/deleteBookResources.ts
Progress sync	app/api/books/[id]/progress/route.ts; src/lib/cloudSync.ts; ios/DawnReader/DawnReader/DawnSyncClient.swift; ios/DawnReader/DawnReader/LibraryModel.swift
Reader state sync	app/api/state/route.ts
Device management	app/api/devices/route.ts; app/api/devices/[id]/route.ts; app/api/device/session/route.ts
AI rewrite/chat	app/api/rewrite/route.ts; app/api/chat/route.ts; src/server/ai.ts
Search	src/server/webSearch.ts
Health/config disclosure	app/api/health/route.ts
Browser book/PDF storage	src/lib/bookStore.ts; src/lib/publication.ts
Browser reading evidence	src/lib/readingEvidence.ts
Browser PDF annotations/progress	src/lib/pdfHighlights.ts; src/lib/pdfLocator.ts
Browser deletion state	src/lib/bookDeletion.ts
iOS endpoint and sync	ios/DawnReader/DawnReader/DawnSyncClient.swift
iOS credentials and AI	ios/DawnReader/DawnReader/SettingsStore.swift; KeychainStore.swift; AIClient.swift; ios/README.md
Product/security documentation	README.md; SECURITY.md; docs/development-workflow.md; docs/product-roadmap.md; docs/reader-mvp.md
Public metadata/indexing	app/layout.tsx; app/robots.ts; app/sitemap.ts
Embedded EPUB media	README.md; src/lib/epubMedia.ts; relevant reader content configuration in src/components/Reader.tsx
Package/build configuration	package.json; lockfile; vite.config.ts; next.config.ts
Binary public assets	Included in reviewed packet; no behavioral claim inferred solely from binaries
5.2 Route inventory
Route	Methods	Authentication evidence	Material operation
/api/books	GET, POST	getAuthenticatedUser	List books/tombstones; upload EPUB
/api/books/[id]	DELETE	getAuthenticatedUser	Tombstone, R2 delete, D1 delete, progress delete
/api/books/[id]/file	GET	getAuthenticatedUser	Tenant-checked EPUB download
/api/books/[id]/progress	GET, PUT	Session or device auth path	Read/write CFI/native locator/percentage
/api/state	GET, PUT	Session or device auth path	Read/replace merged profile/settings JSON
/api/devices	GET, POST	ChatGPT session	List/create device token
/api/devices/[id]	PATCH, DELETE	ChatGPT session	Rename/revoke tenant-owned device
/api/device/session	GET	Device bearer token	Validate token/update label
/api/rewrite	POST	ChatGPT session	Send selected text/context to AI
/api/chat	POST	ChatGPT session	AI chat and optional search
/api/health	GET	ChatGPT session	Expose provider/model/configuration state

All route files in the reviewed repository were accounted for. Static inspection is not a substitute for edge-level authentication, CORS, caching, or origin testing.

6. Finding summary
Severity	Count	IDs	First-user consequence
Blocker	4	BR-001–BR-004	Release cannot proceed
P0	13	BR-005–BR-017	Must be fixed or affected feature disabled before invite
P1	12	BR-018–BR-029	Minimum safety subset must pass; scope-dependent items may be explicitly disabled
P2	3	BR-030–BR-032	May follow only with documented owner and containment
Total	32	BR-001–BR-032	Current disposition: NO-SHIP

The complete field-level records appear in FINDING_LEDGER.md.

7. Comparator synthesis

The comparators were used to extract bounded operational practices, not to expand Dawn Reader into a general media server.

Product/project	Transfer to Dawn Reader	Do not transfer
Calibre-Web	Clear user/admin boundaries, per-user access, operational separation between library management and reading	Shared household library assumptions, broad server administration, content-acquisition features
Calibre-Web-Automated	Controlled ingestion pipeline, recovery-oriented handling of imported files	Automatic conversion/watch folders for untrusted public uploads
Kavita	User roles, administrator-only operations, backup/recovery discipline	Broad comics/manga/media-server scope
Audiobookshelf	Multi-user permissions, explicit backup expectations, operational visibility	Streaming, transcoding, podcast, and audio-session complexity
Komga	Per-user library restrictions and isolated reading progress	One shared server library as the core Dawn data model
BookLore	Account/admin boundary and self-hosted health/backup patterns	Feature expansion unrelated to original-text reading
KOReader	Offline-first resilience, device-oriented progress sync, explicit conflict semantics	Plugin architecture and device-specific UI breadth
Readium	EPUB conformance, locator interoperability, accessibility, and publication-security concepts	Replacing the existing reader stack wholesale
Zotero	Distinguishing structured data sync from file sync; local ownership, export, and backup expectations	Citation-management or research-database features

Sources and limitations are recorded in CLAIM_SOURCE_LEDGER.md.

8. Recommended Beta/public topology
8.1 Required topology
Git repository
  feature/* or codex/*
        |
        v
  pull request + required checks
        |
        v
      main
  (Beta integration branch)
        |
        +--> one immutable application artifact
        |      source SHA
        |      lockfile hash
        |      artifact hash
        |      environment-config hash
        |
        +--> OWNER-ONLY BETA
        |      Sites project: dawn-reader-beta
        |      D1: dawn-reader-beta-db
        |      R2: dawn-reader-beta-books
        |      Beta-only secrets/provider keys
        |      Beta auth audience/domain/access policy
        |      Beta logs/alerts
        |      synthetic or owner-only data
        |
        +--> protected release/public ref
               annotated public-vYYYY.MM.DD.N tag
                       |
                       v
                 PUBLIC PRODUCTION
                       Sites project: dawn-reader-public
                       D1: dawn-reader-public-db
                       R2: dawn-reader-public-books
                       production-only secrets
                       public auth audience/domain
                       production logs/alerts
8.2 Isolation invariants

Beta and public must not share a D1 database.

Beta and public must not share an R2 bucket.

Beta and public must not share user accounts, book rows, progress, settings, tombstones, devices, or owner reading evidence.

Beta and public secrets must be independently rotatable.

Beta access must be owner-only by platform policy, not only by an unadvertised URL.

Promotion moves code, validated configuration, and migration definitions—not user data.

Public data must never be refreshed from Beta.

Synthetic fixtures may be independently created in each environment.

Production backup material must not be restored into Beta unless separately authorized and appropriately minimized.

Logs and analytics must identify environment without mixing content-bearing records.

8.3 Project-targeting blocker

.openai/hosting.json:1-5 contains a fixed project ID and binding names. build/sites-vite-plugin.ts:15-32 copies that file into the build output. vite.config.ts also consumes it.

Before implementation, the Sites deployment contract must establish one of these:

Preferred: build application code once, inject an environment-specific deployment manifest outside application source, and deploy the same artifact to an explicitly selected project; or

Fallback: build deterministically per environment and record source SHA + dependency-lock hash + artifact hash + environment-config hash + target project ID, proving application bytes differ only where environment injection requires it.

A workflow that edits the tracked project ID and creates an unreviewed commit is rejected. A workflow that claims “same commit” while rebuilding with unrecorded environment differences is also rejected.

8.4 Rejected alternatives
Alternative	Reason rejected
One Sites project with a hidden Beta URL	Access by obscurity; shared deployment and data blast radius
Separate branch but shared D1/R2	A Beta deletion, migration, bug, or test can damage public data
Separate D1 but shared R2	Owner books and public books can be exposed, overwritten, orphaned, or deleted across environments
Separate R2 but shared D1	Account, progress, token, tombstone, and metadata crossover remains
Copy Beta database into production	Promotes owner data and experiments; destroys public-state continuity
Maintain two long-lived source trees	Drift prevents exact promotion and doubles review burden
Blind down-migration during rollback	Destructive reversal can worsen an incident; application rollback should tolerate additive schema
Rebuild from the same SHA without artifact/config hashes	Same source does not prove same runtime bytes or target configuration
9. Git and promotion protocol
9.1 Branch and tag contract

main: owner-only Beta integration branch.

feature/<topic> or codex/<topic>: short-lived implementation branches.

release/public: protected ref pointing only to a commit already validated on main.

public-vYYYY.MM.DD.N: annotated release tag pointing to exactly the same source SHA as release/public.

No cherry-pick, merge commit, generated source change, or dependency update is allowed between Beta acceptance and public promotion.

9.2 Required release manifest

Every promotion must produce an immutable manifest containing:

source commit SHA;

parent public release SHA;

package-lock hash;

application artifact hash;

environment configuration hash for Beta and public;

Beta and public project identifiers;

Beta and public deployment/version identifiers;

migration head and migration checksums;

D1 and R2 resource identifiers or irreversible fingerprints;

CI run IDs and required-check conclusions;

Beta smoke evidence;

backup and restore evidence;

public smoke evidence;

operator and independent acceptance identities;

rollback target;

known limitations and disabled features.

9.3 Promotion sequence

Open a PR from a short-lived branch.

Run required unit, integration, migration, dependency, build, and security checks.

Merge only after required checks pass.

Produce the immutable application artifact and release manifest draft.

Target the owner-only Beta project explicitly.

Verify the Beta D1/R2/resource identifiers before mutation.

Apply checksum-verified additive or expand-contract migrations to Beta.

Run automated Beta API checks.

Run owner cloud UI smoke checks.

Run destructive synthetic-account drills in Beta.

Run applicable iOS Beta checks against the Beta endpoint.

Use the exact Beta revision in daily owner use.

Freeze the accepted artifact, source SHA, configuration hash, and migration head.

Create and verify production D1 backup/export and R2 backup or independent recoverable copy.

Restore those backups into disposable resources and compare row/object counts and hashes.

Confirm the production migration remains backward-compatible with the current public application.

Move release/public and create the annotated public tag.

Apply the reviewed production migration.

Deploy the accepted application artifact to the explicitly selected public project.

Run signed-out, signed-in, cross-account, upload, progress, deletion, AI, quota, and cache/header smoke checks.

Observe error, latency, quota, AI-cost, and storage signals.

Close the manifest only after evidence is attached.

10. Rollback protocol
10.1 Application rollback

Switch the public deployment to the last known-good deployment/version or redeploy its recorded immutable artifact.

Confirm the rollback target’s source SHA, artifact hash, configuration hash, and migration compatibility.

Keep additive schema in place when the earlier application can tolerate it.

Disable the affected feature or roll forward when the schema is not safely reversible.

Do not rebuild the prior source opportunistically and call it the same release.

10.2 Data rollback and recovery

Do not perform blind down-migrations.

Restore D1 only from a tested, environment-matched backup or verified Time Travel/export mechanism.

Restore R2 only from an independent tested backup/copy or verified object-recovery mechanism.

Reconcile D1 rows, R2 objects, progress rows, and tombstones after recovery.

Never restore Beta data into public.

Preserve a recovery audit record and identify any writes lost after the recovery point.

Notify affected users when integrity or confidentiality could have been affected.

10.3 Credential and provider rollback

Disable AI or search independently from core reading.

Revoke affected device tokens.

Rotate Beta and public secrets independently.

Verify old credentials fail.

Avoid logging replacement credentials or reading content during diagnosis.

11. Release gates G0–G9
Gate	Purpose	Baseline status	Required pass evidence
G0 — Baseline and provenance	Know exactly what code and artifact are under test	FAIL/PARTIAL	Source SHA, lockfile hash, artifact hash, config hash, migration head, CI IDs, and deployment IDs are recorded and mutually consistent
G1 — Beta/public isolation	Prevent Beta changes or data from affecting public	FAIL	Independent projects, D1, R2, secrets, auth/access, logs, and explicit synthetic cross-environment isolation tests
G2 — Auth, tenant, origin, device, and abuse controls	Prevent unauthorized or unbounded use	FAIL	Spoofed-header rejection, two-account tests, same-origin/CSRF enforcement, body/rate/device limits, token rotation/revocation
G3 — Migrations, backup, and restore	Make schema and data changes recoverable	FAIL	Checksum migration runner, backward-compatibility tests, D1 and R2 backup plus disposable restore drill
G4 — Upload, delete, quota, and reconciliation	Preserve book and metadata integrity	FAIL	EPUB validation, per-user quotas, operation idempotency, injected-failure tests, orphan reconciler
G5 — Sync and Web/iOS compatibility	Preserve locators and state across clients	FAIL	Versioned patch semantics, server ordering, clock-skew/concurrency tests, Web/iOS contract suite; iOS can be N/A only if not offered
G6 — Privacy, export, erasure, and AI disclosure	Set an honest data boundary	FAIL	Accurate notice, provider disclosure, export, cloud erase, local-clear instructions/control, retention exceptions
G7 — Observability and incident readiness	Detect and contain failure without leaking text	FAIL	Redacted structured logs, alerts, request IDs, cost/storage signals, incident and credential-revocation drill
G8 — UX, accessibility, performance, and support	Let a real user recover from ordinary failures	FAIL/PARTIAL	First-run/error/offline/quota states, keyboard/zoom/screen-reader checks, representative large/corrupt-file tests, support path
G9 — Exact-SHA promotion and rollback rehearsal	Prove the release can be promoted and reversed	NOT RUN / FAIL	Exact accepted revision promoted to disposable/public-like target, smoke passed, prior revision restored, evidence complete
11.1 Gate rule

The first external invite requires all applicable gates to pass. A gate may be marked N/A only by removing the affected feature from the first-user surface and proving it is disabled. Documentation alone cannot make a gate pass.

12. First-external-user acceptance matrix
12.1 Automated cloud checks
Test	Pass criterion	Gate
Build identity	Runtime release endpoint or operator manifest matches source, artifact, config, and migration hashes	G0, G9
Environment isolation	Beta and public report different project/resource fingerprints; synthetic Beta data is absent from public and vice versa	G1
Signed-out API	Every protected route returns 401/403 without identity	G2
Spoofed identity	Direct or unsupported-origin requests cannot create trusted identity by supplying oai-* headers	G2
Tenant isolation	User A cannot list, download, update, rename, revoke, or delete User B resources	G2
Origin/CSRF	Cross-origin state-changing requests fail	G2
Rate/body limits	Oversized and over-budget requests fail before expensive processing with bounded 4xx/429 responses	G2
Migration	Clean and previous-version snapshots migrate to the expected checksum and remain usable by N-1 during expand phase	G3
Restore	D1 rows and R2 object counts/hashes match the backup manifest in disposable restored resources	G3
Upload validation	Malformed ZIP, traversal, invalid container, unsupported encrypted archive, expanded-size bomb, and wrong type are rejected	G4
Fault injection	Upload/delete retries converge to one correct D1/R2 state after failure at each step	G4
Sync conflict	Concurrent Web/iOS updates preserve both locator fields and resolve deterministically without client-clock corruption	G5
State conflict	Concurrent stale state update returns conflict rather than silently overwriting newer data	G5
Export/erase	Export is complete; erasure revokes tokens and removes covered D1/R2 records idempotently	G6
Log redaction	Automated assertions show no selected text, book content, title, token, API key, or prompt body in logs	G7
Dependency/provenance	Required checks, pinned actions, dependency review, artifact attestation/manifest pass	G0, G9
12.2 Cloud UI smoke checks
Scenario	Pass criterion
Signed-out first visit	Clear authentication state; no private content or mutation
Empty library	Explains supported formats, local/cloud storage boundary, and next action
EPUB import	Valid file imports once; progress and feedback remain visible
PDF import	UI explicitly identifies local-only storage
Open/resume	Correct book and position restore after refresh and second session
AI rewrite/chat	Disclosure is visible; bounded request; cancellation and provider failure are recoverable
Search	UI identifies whether Brave, Wikipedia fallback, or no search was used
Offline	Existing local book remains readable where supported; cloud actions fail without data loss
Quota exceeded	Clear non-destructive message with current use and resolution
Delete	Scope is explicit; failure is recoverable; no resurrection
Account/data controls	Export, clear-local-data, revoke-device, and erase-account paths are discoverable
Support	User can report a problem without pasting private book text or credentials
12.3 Destructive synthetic-account drills

Create two unrelated accounts and prove all API object IDs remain tenant-isolated.

Upload, interrupt, retry, and reconcile a book operation.

Delete during concurrent progress update.

Revoke a device while it is making requests; subsequent requests must fail.

Exceed device, request, storage, and AI budgets.

Corrupt a migration target and prove release aborts before public deployment.

Restore D1 and R2 into disposable resources and compare the backup manifest.

Erase one account and prove the other account is unchanged.

Roll back the application while retaining compatible additive schema.

Rotate one environment’s secrets and prove the other environment is unaffected.

12.4 iOS checks

Required only when iOS is offered to the first user:

Beta build targets Beta only; public build targets public only.

The selected endpoint/environment is visible in diagnostics.

Device token creation, storage, use, rotation, and revocation work.

Web CFI and native locator survive alternating Web/iOS updates.

Clock skew does not move progress backward or erase a locator.

Disconnect behavior distinguishes server revocation, local-token removal, local-book retention, and local-data deletion.

Account switching cannot expose the previous account’s books or settings.

Direct AI-provider disclosure and Keychain lifecycle are accurate.

VoiceOver, text scaling, touch targets, import, offline, and error states pass.

If iOS is excluded, device pairing and iOS entry points must be disabled or clearly unsupported for the first user rather than left partially accessible.

12.5 Real-user acceptance

The first external user must be able to:

understand what is local, what is cloud-synced, and what leaves Dawn Reader for AI/search;

import, read, resume, use assistance, and delete without owner intervention;

recover from offline, malformed-file, quota, and provider failures;

revoke devices and export or erase data;

contact support without sharing private content;

receive an accurate explanation of any incident;

use the product without encountering owner books, owner history, Beta experiments, or mixed-environment records.

13. Phased implementation program
Phase A — Before owner-only Beta

Resolve Sites environment targeting and private-access capabilities.

Create isolated Beta project, D1, R2, secrets, logs, and access.

Remove fixed-project ambiguity from the build/deploy contract.

Add release manifest and resource-identity checks.

Establish migrations and backup/restore.

Add minimum origin, request-size, device, AI, and upload limits.

Phase B — Before first external invite

Complete all blocker and P0 findings.

Complete the applicable P1 minimum: AI/search disclosure, local-data controls, security headers, first-run/error states, accessibility smoke, representative performance tests, iOS isolation if offered, and cloud release checks.

Pass G0–G9.

Complete the exact-revision promotion and rollback rehearsal.

Publish accurate privacy, support, export, and erasure information.

Phase C — During controlled external Beta

Improve conflict visualization and offline queues.

Extend accessibility coverage.

Add deeper performance regression tests.

Mature dependency governance and artifact attestations.

Add safe retention cleanup, support metrics, and incident tabletop repetition.

Phase D — Before broader production

Formalize service-level objectives and capacity budgets.

Validate legal/service-term requirements for target user jurisdictions.

Add broader browser/device compatibility.

Review telemetry retention and operational access.

Reassess provider contracts and data residency where relevant.

14. Explicit unverified items

Whether Sites permits two independent projects for this application under the current account.

Whether a Sites project can be made owner-only by enforced identity policy.

Whether a deployment can explicitly target a project without the tracked .openai/hosting.json project ID.

Whether Sites can deploy one immutable artifact to two projects without rebuilding.

Whether Sites exposes deployment versions, traffic switching, or one-command rollback.

Whether the underlying Workers versions/deployments controls are exposed through Sites.

Whether D1 migrations, Time Travel, import/export, and restore operations are exposed in the current Sites workflow.

Whether R2 versioning, lifecycle, replication, or an equivalent recoverable-copy mechanism is enabled.

The actual Beta/public D1 and R2 resource identifiers and whether any are shared.

The actual live project’s identity-header trust boundary and whether spoofed oai-* headers are stripped.

The actual CORS, CSP, HSTS, cache, frame, MIME, referrer, and permissions headers returned by the live site.

Whether private EPUB responses can be cached across identities by any upstream cache configuration.

The actual production secret inventory, rotation history, access list, and provider accounts.

Whether production D1/R2 contain any user or owner data requiring preservation.

The current production backup state and achievable recovery point/recovery time.

Current branch protection, required-review, environment-approval, and workflow-permission settings.

The current Sites deploy process and whether it records source SHA.

Current AI and search provider retention, regional processing, contract, and cost limits.

Current log destinations, retention, access, and content-redaction behavior.

The iOS app’s current build status, signing configuration, distribution channel, and runtime endpoint outside source.

Whether any existing device tokens have been disclosed, copied, or left stale.

The legal jurisdictions and age profile of intended external users.

Whether EPUB embedded resources can make remote network requests in every supported reader surface.

Whether the browser’s IndexedDB/localStorage data is shared with any other product origin or test deployment.

Actual performance on representative scholarly PDFs, complex EPUBs, media-heavy books, and low-memory devices.

Actual assistive-technology behavior on the deployed Web and signed iOS builds.

Each item remains unverified until direct console, deployment, runtime, or device evidence is captured. None is upgraded to fact by this report.

15. Adversarial self-review

The report does not classify the public site as safe merely because the product is described as “not launched.”

It does not treat tenant-prefixed code as proof of edge authentication or cross-tenant safety.

It does not recommend enterprise ceremony without a failure mode. The required controls address wrong-project deployment, unrecoverable migration, cross-environment deletion, abusive AI spend, inconsistent D1/R2 state, or private-content exposure.

It rejects sharing Beta/public storage even though sharing would reduce setup effort.

It does not assume Cloudflare documentation proves equivalent Sites controls.

It does not infer iOS acceptance from Web CI.

It does not call a source SHA sufficient when environment configuration can change runtime behavior.

It does not recommend blind down-migrations.

It distinguishes cloud erasure from local browser/iOS deletion.

It preserves Dawn Reader’s original-text-first model. No recommendation requires full-book translation, vocabulary gamification, content acquisition, or a general media-server redesign.

P1/P2 findings are not silently promoted to blockers. Their first-user disposition is feature- and scope-dependent and is stated in the ledger.

All 32 IDs are unique and covered by the backlog.

16. Tools and research record

The completed research used:

archive listing and integrity inspection;

SHA-256 verification;

tracked-file manifest and size review;

recursive repository path and symbol searches;

line-numbered inspection of API routes, schema, migrations, Web storage, reader, iOS, workflows, and documentation;

package/workflow/dependency inspection;

primary-source searches across Cloudflare, OWASP, W3C, GitHub, NIST, Apple, OpenAI, Brave, Wikimedia, and comparator projects;

a local test invocation attempt that did not establish a pass or failure because dependencies were unavailable.

No production deployment, private account, database, bucket, secret, or user content was accessed or changed.

17. Repair acceptance mapping
Repair item	Disposition
REPAIR-001 complete structured response	Satisfied by the four inline deliverables
REPAIR-002 readiness report	This document
REPAIR-003 stable finding ledger	FINDING_LEDGER.md, BR-001–BR-032
REPAIR-004 claim/source ledger	CLAIM_SOURCE_LEDGER.md
REPAIR-005 implementation backlog	IMPLEMENTATION_BACKLOG.md
REPAIR-006 comparator and repository/API coverage	Sections 5 and 7 plus source ledger
REPAIR-007 unverified list and bilateral judgment	Sections 2 and 14
