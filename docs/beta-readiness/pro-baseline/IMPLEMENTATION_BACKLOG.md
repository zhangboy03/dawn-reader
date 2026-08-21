Dawn Reader — Ordered Beta Readiness Implementation Backlog

Baseline: adf73dda00a45762b3baacb961d20f10bada415e
Decision: No first external invite until every applicable G0–G9 gate passes.
Data invariant: Beta/public promotion moves code, configuration definitions, and migrations only. It never copies accounts, EPUBs, progress, settings, devices, tombstones, or reading evidence.

1. Gate definitions
Gate	Exit condition
G0	Exact source, dependency, artifact, configuration, migration, CI, and deployment provenance
G1	Platform-enforced owner-only Beta with independent public/Beta data and operational resources
G2	Proven authentication, tenant isolation, origin/CSRF, device lifecycle, and abuse limits
G3	Explicit migrations plus tested D1/R2 backup and restore
G4	Validated publication intake, quotas, idempotent mutation, and reconciliation
G5	Conflict-safe Web/iOS progress and state protocol
G6	Accurate privacy/provider/storage disclosure, export, erasure, and local-data controls
G7	Redacted observability, alerting, incident response, and credential revocation
G8	First-run, error, offline, accessibility, performance, and support acceptance
G9	Exact accepted revision promoted and rolled back through a complete rehearsal
2. Roles

The repository owner may fill multiple roles, but each release record must identify who performed and who accepted each step.

Release owner: branch, manifest, target verification, promotion, rollback.

Platform owner: Sites, D1, R2, access, secrets, backups.

Backend/data owner: migrations, API, quotas, reconciliation, sync.

Web owner: browser storage, UI states, accessibility, headers.

iOS owner: endpoint configuration, device lifecycle, protocol, VoiceOver.

Product/security owner: threat model, privacy, abuse, incident response.

QA/independent acceptor: evidence review and gate disposition.

3. Ordered backlog
B-000 — Freeze and identify the current public state

Priority: blocker prerequisite
Findings: BR-002, BR-003, BR-004
Gates: G0, G3
Owner: Release owner + Platform owner
Dependencies: None

Work

Record current public source SHA if available.

Record current project, deployment/version, D1, R2, binding, domain, secret-set, and migration identifiers.

Inventory current D1 table counts and R2 object count/bytes without exposing content.

Identify whether any real or owner data must be preserved.

Freeze destructive changes until backup and target identity are known.

Acceptance criteria

Signed baseline inventory exists.

Unknown fields are marked unknown, not inferred.

Release owner can name the current rollback target or explicitly declares none exists.

No Beta resource is mistaken for public.

Rollback/containment

No mutation is performed. If identity cannot be established, stop public changes and continue only in a newly isolated Beta.

Evidence artifact: baseline-inventory.json or equivalent redacted record.

B-001 — Verify Sites capabilities and create isolated owner-only Beta

Priority: blocker
Findings: BR-001
Gates: G1
Owner: Platform owner
Dependencies: B-000

Work

Verify multiple-project, private-access, deployment-target, and rollback capabilities directly.

Create dawn-reader-beta.

Create independent Beta D1 and R2 resources.

Create independent Beta secrets and provider keys.

Enforce owner-only access at the platform boundary.

Separate logs/alerts and auth audience/domain.

Acceptance criteria

Distinct project/resource fingerprints are recorded.

Unauthenticated and non-owner access fails.

Synthetic cross-environment marker test passes both directions.

Beta secret rotation has no public effect.

No production user data is copied.

Rollback

Disable Beta access and remove/recreate only Beta resources. Public remains unchanged.

Evidence artifact: G1 isolation report with screenshots/IDs redacted as needed.

B-002 — Make environment targeting deterministic

Priority: blocker
Findings: BR-001, BR-002, BR-025
Gates: G0, G1, G9
Owner: Release owner + Platform owner
Dependencies: B-001

Work

Remove ambiguity caused by the fixed project ID in .openai/hosting.json.

Prefer a neutral application artifact plus separately injected environment deployment manifest.

Otherwise record deterministic environment-specific artifact/config hashes.

Add predeploy assertions for environment, target project, D1, R2, domain, and migration head.

Add explicit iOS Beta/public endpoint configuration if iOS remains in scope.

Acceptance criteria

A Beta deployment cannot target public resources.

A public deployment cannot target Beta resources.

Target mismatch aborts before migration or upload.

Manifest records source SHA, artifact hash, config hash, and target.

Signed iOS builds expose and enforce the intended environment.

Rollback

Restore the prior build configuration while disabling public promotion. Do not edit tracked project IDs manually during release.

Evidence artifact: environment-target contract and negative target tests.

B-003 — Establish protected promotion refs and release manifest

Priority: blocker
Findings: BR-002, BR-028
Gates: G0, G9
Owner: Release owner
Dependencies: B-002

Work

Treat main as Beta integration.

Protect release/public.

Create annotated public-vYYYY.MM.DD.N tags.

Generate immutable manifest and checksums.

Retain accepted artifacts.

Prevent source/dependency changes between Beta acceptance and public promotion.

Acceptance criteria

release/public points to a commit already accepted on Beta.

Tag and ref point to the same SHA.

Manifest validates artifact/config/migration/deployment identity.

Tampering or post-acceptance rebuild mismatch aborts.

Prior public artifact remains available.

Rollback

Move runtime to the recorded prior deployment/artifact. Do not rewrite or delete release evidence.

Evidence artifact: release manifest schema plus dry-run manifest.

B-004 — Replace runtime DDL with explicit migrations

Priority: blocker
Findings: BR-003
Gates: G3
Owner: Backend/data owner
Dependencies: B-001, B-002

Work

Remove runtime CREATE TABLE.

Add immutable migration checksums and lock.

Assert target environment/resource before apply.

Adopt additive/expand-contract changes.

Add clean-database and previous-head test fixtures.

Record migration head in runtime/release diagnostics.

Acceptance criteria

Clean and previous schemas migrate successfully.

Reapply is safe.

Wrong resource/checksum fails.

N and N-1 application compatibility is tested during expansion.

No request path mutates schema.

Rollback

Application rollback with additive schema retained; otherwise feature disable/roll-forward. Restore only from tested backup.

Evidence artifact: migration test report and checksum ledger.

B-005 — Implement and rehearse D1/R2 backup and restore

Priority: blocker
Findings: BR-004
Gates: G3
Owner: Platform owner + Backend/data owner
Dependencies: B-004

Work

Define separate Beta/public backup mechanisms.

Produce D1 export/point-in-time record and R2 recoverable copy/version strategy.

Generate manifest of rows, objects, sizes, and hashes.

Restore into disposable resources.

Reconcile restored data.

Acceptance criteria

Disposable restore matches expected row/object/hash inventory.

Restored books open and progress resolves.

Access to backup material is restricted and logged.

Owner-defined RPO/RTO is recorded and met.

Beta backup cannot be restored over public by default.

Rollback

Abort promotion if restore fails. Retain current public deployment/resources.

Evidence artifact: backup/restore drill report.

P0-006 — Prove the edge identity, origin, and tenant boundary

Priority: P0
Findings: BR-013
Gates: G2
Owner: Product/security owner + Backend owner
Dependencies: B-001

Work

Document identity-header trust.

Strip/reject forged forwarded identity.

Disable development bypass in Beta/public.

Add same-origin/Origin or anti-CSRF controls.

Restrict CORS.

Build two-account authorization tests for every route and method.

Acceptance criteria

Forged identity headers fail.

Signed-out and cross-origin mutations fail.

User A cannot operate on User B IDs.

Error behavior does not reveal foreign-resource existence.

Live request/cookie/header evidence is attached.

Rollback

Disable cloud mutations or require a safer temporary auth path. Never enable development bypass.

Evidence artifact: route authorization matrix.

P0-007 — Complete device credential and pairing controls

Priority: P0
Findings: BR-005, BR-006
Gates: G2
Owner: Backend/data owner + iOS owner
Dependencies: P0-006

Work

Add token expiry, version, scope, rotation, and replacement.

Enforce active-device and creation-rate limits.

Require recent session confirmation for token creation/display.

Add idempotency and redacted audit events.

Clarify revoke/not-found behavior.

Acceptance criteria

Old, expired, revoked, malformed, and wrong-scope tokens fail.

Cross-origin creation fails.

Device ceiling/cooldown works.

Rotation preserves intended continuity.

No raw token appears in logs.

User can identify and revoke a device.

Rollback

Disable device creation; keep revoke/list. Revoke all tokens from a compromised generation if necessary.

Evidence artifact: device lifecycle test ledger.

P0-008 — Add route, body, AI, and provider budgets

Priority: P0
Findings: BR-007, BR-018, BR-019
Gates: G2, G6
Owner: Backend owner + Product/security owner
Dependencies: P0-006

Work

Apply pre-parse body caps.

Add per-user/IP rate limits.

Add AI/search concurrency, daily budget, timeout, and kill switch.

Distinguish Brave, Wikipedia, and disabled search.

Emit content-free budget metrics.

Acceptance criteria

Oversized/over-budget requests fail before provider/storage work.

429 behavior is deterministic.

One user does not consume another’s budget.

Provider state in health/UI is accurate.

AI/search can be disabled independently.

Rollback

Increase reviewed thresholds or disable AI/search. Keep hard body limits.

Evidence artifact: resource-consumption test report.

P0-009 — Validate EPUB containers before persistence

Priority: P0
Findings: BR-008, BR-024, BR-030
Gates: G4, G8
Owner: Backend owner + Web owner
Dependencies: P0-008

Work

Validate ZIP paths, entry count, compression ratio, expanded bytes, required EPUB files, package/spine, encryption, and active/remote content.

Define supported publication policy.

Quarantine indeterminate files.

Add malformed corpus tests.

Acceptance criteria

All rejection fixtures in BR-008 and performance fixtures in BR-024 behave as documented. Valid EPUBs remain usable. Rejected content is not stored in the normal bucket.

Rollback

Disable cloud uploads and retain local import. Disable remote/active content.

Evidence artifact: publication-validation corpus and results.

P0-010 — Implement aggregate storage quota

Priority: P0
Findings: BR-009
Gates: G4
Owner: Backend/data owner
Dependencies: B-001, P0-009

Work

Define per-user byte and book-count limits.

Reserve/finalize upload capacity.

Include orphan/pending objects.

Add UI usage/error state.

Add environment-level emergency ceiling.

Acceptance criteria

Concurrent/retried uploads cannot exceed limits; failed reservations release; reconciliation detects unaccounted objects; usage is tenant-isolated.

Rollback

Raise limits or disable upload. Do not remove accounting.

Evidence artifact: quota concurrency tests.

P0-011 — Add idempotent mutation journal and reconciler

Priority: P0
Findings: BR-010
Gates: G4
Owner: Backend/data owner
Dependencies: B-004, P0-010

Work

Add operation ID/status for upload/delete.

Make retries idempotent.

Use conditional transitions and safe compensation.

Build D1/R2/tombstone/progress reconciler.

Support report-only and reviewed repair modes.

Acceptance criteria

Fault injection at every step converges to one correct state. Orphans and missing objects are detected without foreign deletion. Client can query stable operation status.

Rollback

Disable mutation; run report-only reconciliation; manually approve repair.

Evidence artifact: injected-failure matrix.

P0-012 — Version the progress protocol and preserve locators

Priority: P0
Findings: BR-011
Gates: G5
Owner: Backend/data owner + Web owner + iOS owner
Dependencies: B-004

Work

Add protocol version and server revision.

Use patch semantics.

Preserve independent CFI/native locators.

Separate client observation time from server order.

Define deletion/progress conflict.

Support old clients during migration.

Acceptance criteria

Alternating Web/iOS, duplicate, delayed, concurrent, offline, and ±24-hour clock-skew tests preserve both locator fields and resolve deterministically.

Rollback

Dual-read and feature-flag new writes. Preserve new fields; do not mass-convert destructively.

Evidence artifact: cross-client protocol suite.

P0-013 — Add versioned reader-state concurrency

Priority: P0
Findings: BR-012
Gates: G5
Owner: Backend/data owner + Web/iOS owners
Dependencies: B-004

Work

Define state schema and byte limit.

Add revision/ETag and conditional write.

Prefer field-level patching.

Return structured 409 conflicts.

Preserve unknown compatible fields.

Acceptance criteria

Concurrent stale writes cannot silently overwrite; invalid/large data fails; retry/merge produces intended result.

Rollback

Continue old reads; gate new writes. Preserve stored JSON.

Evidence artifact: state conflict tests.

P0-014 — Implement user export, erasure, and local-clear controls

Priority: P0
Findings: BR-014, BR-020, BR-032
Gates: G6
Owner: Backend/data owner + Web owner + iOS owner
Dependencies: P0-011, P0-012, P0-013

Work

Define export manifest.

Export D1 categories and eligible R2 content.

Implement idempotent account erase and token revocation.

Implement per-book/all-local-data clear.

State backup/log retention exceptions.

Add retention inventory.

Acceptance criteria

Synthetic export is complete and validated; erase removes covered cloud records and devices; local clear removes every indexed store/key; another account/book remains intact; repeated execution is safe.

Rollback

Pause before destructive checkpoint. Do not silently restore after confirmed erasure.

Evidence artifact: export/erase/local-clear drill.

P0-015 — Publish accurate privacy, storage, provider, and copyright disclosures

Priority: P0
Findings: BR-015, BR-018, BR-019, BR-030
Gates: G6
Owner: Product/security owner
Dependencies: P0-008, P0-009, P0-014

Work

Document ChatGPT identity use.

Distinguish cloud EPUB and local PDF/evidence.

Enumerate AI fields and active provider.

Identify search provider/fallback.

Explain retention, export, erasure, support, and imported-content responsibility.

Correct stale reader-mvp claims.

Add first-use notices without disrupting reader-first flow.

Acceptance criteria

Every actual data flow has a matching disclosure. Reviewer verifies UI text against network/storage behavior. No claim promises deletion or locality beyond implementation.

Rollback

Disable the inaccurately described feature and remove external access until corrected.

Evidence artifact: claim-to-data-flow review.

P0-016 — Add redacted telemetry and operational alerts

Priority: P0
Findings: BR-016
Gates: G7
Owner: Platform owner + Product/security owner
Dependencies: B-001, P0-011

Work

Define content-free event schema.

Add request/operation correlation.

Track route status/latency, auth failures, quotas, AI spend, storage, reconciliation, migration, and deployment.

Separate Beta/public telemetry.

Add alerts and access/retention controls.

Acceptance criteria

Representative incidents trigger alerts; automated redaction tests prove content/token/key/email exclusion; one failed mutation is traceable.

Rollback

Remove optional fields or reduce retention. Retain minimum security/availability signals.

Evidence artifact: telemetry schema, redaction tests, alert drill.

P0-017 — Write and rehearse the incident runbook

Priority: P0
Findings: BR-017, BR-031
Gates: G7
Owner: Product/security owner + Release owner
Dependencies: B-003, B-005, P0-007, P0-016

Work

Define severity, contacts, containment, feature kill switches, rollback, restore, reconciliation, communication, and postmortem.

Include token/provider key leak, wrong project, bad migration, R2/D1 inconsistency, and cross-tenant suspicion.

Add privacy-safe support intake.

Acceptance criteria

All BR-017 table-top scenarios are completed with recorded decisions. Owner can revoke each secret/token class and recover service without private-content logging.

Rollback

Version the runbook. Operational rollback follows recorded release and backup targets.

Evidence artifact: incident tabletop record.

P1-018 — Correct AI and search UX/provenance

Priority: P1, required if AI/search exposed
Findings: BR-018, BR-019
Gates: G6, G8
Owner: Web owner + Backend owner
Dependencies: P0-008, P0-015

Work

Show bounded first-use disclosure.

Label model-generated content and search provider.

Preserve source URLs.

Add cancellation, timeout, fallback, and no-search states.

Test prompt injection and provider error sanitization.

Acceptance criteria

Network fields match notice; source/provider label is accurate; disabled/unavailable search is not represented as verified; core reading remains usable without AI.

Rollback

Disable AI/search UI and routes independently.

Evidence artifact: AI/search state matrix.

P1-019 — Complete browser-local data lifecycle

Priority: P1, required if PDF/evidence exposed
Findings: BR-020, BR-032
Gates: G6
Owner: Web owner
Dependencies: P0-014

Work

Centralize local-store inventory.

Add export, per-book clear, clear-all, and shared-device warning.

Define tombstone retention/compaction.

Add browser compatibility tests.

Acceptance criteria

No residual source blob, metadata, locator, highlight, evidence, cache, or expired tombstone remains after intended clear.

Rollback

Disable destructive control; provide accurate manual guidance. Never auto-clear.

Evidence artifact: local storage inventory and deletion tests.

P1-020 — Add and verify security/cache headers

Priority: P1 minimum before invite
Findings: BR-021, BR-030
Gates: G2, G8
Owner: Web owner + Platform owner
Dependencies: P0-006, P0-009

Work

Add CSP report-only then enforced.

Add framing, MIME, referrer, permissions, and transport controls.

Set sensitive APIs to no-store.

Verify tenant-safe EPUB caching.

Constrain publication remote content.

Acceptance criteria

Live header matrix passes; cross-user cache test passes; CSP violation corpus is understood; reader remains functional.

Rollback

Return CSP to report-only. Retain no-store/private/MIME safeguards.

Evidence artifact: live-header report.

P1-021 — Complete first-run, offline, failure, and support states

Priority: P1 minimum before invite
Findings: BR-022, BR-031
Gates: G8
Owner: Product/Web owner
Dependencies: P0-015, P0-016

Work

Implement the cloud UI smoke matrix: signed-out, empty, local/cloud distinction, offline, quota, malformed file, provider failure, partial mutation, export/erase, and support.

Acceptance criteria

Independent tester completes all scenarios without owner/database access. Errors are non-destructive and content-safe.

Rollback

Disable incomplete action; preserve import/reading fallback.

Evidence artifact: first-run smoke record.

P1-022 — Establish accessibility acceptance

Priority: P1 minimum before invite
Findings: BR-023
Gates: G8
Owner: Web owner + iOS owner
Dependencies: P1-021

Work

Keyboard/focus audit.

Zoom, text spacing, contrast, reduced motion, target-size checks.

Web screen-reader and iOS VoiceOver smoke.

EPUB/PDF/selection-surface-specific checks.

Record limitations.

Acceptance criteria

Minimum BR-023 test set passes for every first-user surface. Critical failure has an accessible fallback or disabled feature.

Rollback

Use native/fallback controls and disable inaccessible optional surfaces.

Evidence artifact: accessibility matrix.

P1-023 — Establish publication performance and corruption budgets

Priority: P1 before exposing broad file support
Findings: BR-024
Gates: G4, G8
Owner: Web owner + Backend owner
Dependencies: P0-009, P0-011

Work

Build representative EPUB/PDF corpus.

Define memory/time/file limits and cancellation.

Move legacy hashing/reconciliation out of latency-sensitive requests.

Add regression thresholds.

Acceptance criteria

All BR-024 corpus cases terminate predictably, preserve existing data, and produce actionable errors. No archive exceeds server expansion budget.

Rollback

Reduce advertised limits, disable media/unsupported files, or move operation to bounded background processing.

Evidence artifact: performance/corruption report.

P1-024 — Separate iOS Beta/public configuration and lifecycle

Priority: P1, required only if iOS offered
Findings: BR-025, BR-026
Gates: G1, G5, G6
Owner: iOS owner
Dependencies: B-002, P0-007, P0-012, P0-014

Work

Add signed environment configuration.

Namespace local data by account/environment.

Separate revoke/disconnect/local-delete/API-key removal.

Review Keychain accessibility.

Add account-switch tests.

Acceptance criteria

All iOS acceptance cases in the readiness report pass. Beta/public endpoint crossover is impossible in release builds.

Rollback

Exclude iOS, revoke tokens, and disable pairing.

Evidence artifact: signed-build environment and lifecycle report.

P1-025 — Expand CI and required checks

Priority: P1 minimum before invite
Findings: BR-027
Gates: G0, G3, G9
Owner: Release owner + QA
Dependencies: B-003, B-004, P0-006, P0-011, P0-012

Work

Add migration compatibility.

Add API authorization/contract tests.

Add disposable-resource destructive suite.

Add release-manifest validation and deployment smoke.

Add iOS build/protocol tests when applicable.

Configure required checks.

Acceptance criteria

Deliberate defects in migration, tenant check, environment ID, locator protocol, artifact identity, and rollback are rejected.

Rollback

Temporarily quarantine only a proven flaky non-core test with owner and issue. Core security/recovery checks remain required.

Evidence artifact: required-check policy and failure demonstrations.

P1-026 — Harden supply-chain and dependency provenance

Priority: P1
Findings: BR-028, BR-029
Gates: G0, G9
Owner: Release owner
Dependencies: P1-025

Work

Pin Actions to full SHAs.

Minimize token permissions.

Add dependency review, SBOM/license inventory, artifact attestation.

Cover SwiftPM.

Define critical advisory and rollback policy.

Acceptance criteria

Tampered artifact/dependency delta fails; Web/iOS inventories exist; action updates are reviewed; release artifact verifies.

Rollback

Restore prior reviewed action/dependency SHA and lockfiles.

Evidence artifact: SBOM/license/provenance bundle.

P2-027 — Enforce publication remote-content and copyright policy

Priority: P2; remote content must remain disabled until complete
Findings: BR-030
Gates: G2, G6, G8
Owner: Product/security owner + Web owner
Dependencies: P0-009, P1-020

Work

Define permitted packaged/remote resources.

Sandbox publication contexts.

Suppress credentials/referrers.

Add user consent where remote load is intentionally supported.

Add imported-content responsibility language.

Acceptance criteria

Remote-resource corpus follows policy with no unauthorized network/cookie/referrer disclosure.

Rollback

Disable all remote/active publication content.

Evidence artifact: EPUB network-policy tests.

P2-028 — Formalize support and retention operations

Priority: P2
Findings: BR-031, BR-032
Gates: G6, G7, G8
Owner: Product/security owner + Platform owner
Dependencies: P0-014, P0-016, P0-017

Work

Define ordinary support and security routes.

Define response ownership.

Add content-free diagnostics.

Set retention for logs, exports, backups, devices, tombstones, and orphans.

Implement dry-run cleanup.

Acceptance criteria

Support drill succeeds without private content. Retention boundary fixtures are cleaned or retained correctly and idempotently.

Rollback

Disable cleanup and revert to documented retention. Keep security contact active.

Evidence artifact: support/retention policy and cleanup report.

REL-029 — Run complete Beta acceptance

Priority: release gate
Findings: All BR-001–BR-032 as applicable
Gates: G0–G8
Owner: QA/independent acceptor
Dependencies: All applicable prior tasks

Work

Run:

automated cloud checks;

cloud UI smoke;

destructive synthetic-account drills;

applicable iOS checks;

owner daily-use acceptance.

Acceptance criteria

G0–G8 each have dated evidence and pass disposition.

Disabled features are inaccessible, not merely undocumented.

No open blocker/P0 remains.

Applicable minimum P1 tests pass.

Unverified platform facts affecting safety are resolved or converted to explicit blockers.

Rollback

Do not promote. Continue owner-only Beta with disposable/owner data.

Evidence artifact: consolidated Beta acceptance packet.

REL-030 — Rehearse exact-revision promotion and rollback

Priority: final blocker
Findings: BR-002, BR-003, BR-004, BR-027, BR-028
Gates: G9
Owner: Release owner + Platform owner + QA
Dependencies: REL-029

Work

Freeze accepted source/artifact/config/migration identity.

Back up and restore disposable public-like state.

Promote exact accepted revision to disposable public-like target.

Run smoke.

Deploy a controlled successor or failure fixture.

Restore prior application revision.

Verify schema/data compatibility and resource identity.

Acceptance criteria

Same accepted artifact or fully recorded deterministic artifact reaches the intended target.

Prior revision is restored without blind down-migration.

Data integrity manifest remains correct.

All deployment IDs and evidence are captured.

Operator can execute the documented procedure without improvisation.

Rollback

The task itself proves rollback. Failure leaves the real public environment untouched and keeps release blocked.

Evidence artifact: G9 rehearsal record.

REL-031 — First public external-user promotion

Priority: release action
Findings: All applicable
Gates: G0–G9
Owner: Release owner; QA accepts
Dependencies: REL-030

Work

Confirm production backup/restore evidence is current.

Apply reviewed additive production migration.

Deploy the exact accepted revision.

Run public signed-out/signed-in/two-account/header/quota/delete/AI smoke.

Observe redacted telemetry.

Invite only after smoke passes.

Acceptance criteria

All G0–G9 are passed.

Release manifest is closed.

Public contains no Beta/owner data.

User-facing privacy/support/export/erase controls are live.

Rollback target remains immediately identifiable.

First-user support owner is active.

Rollback

Restore the prior recorded application deployment; disable affected feature; reconcile data; communicate if user data was affected.

Evidence artifact: final public release manifest and invite authorization.

4. First-invite minimum scope rule

A narrower release is permitted only by disabling features and satisfying the corresponding conditions:

Feature omitted	Findings that may become N/A	Required proof
iOS and pairing	BR-005, BR-006, BR-025, BR-026; iOS part of BR-027	Pairing APIs/UI inaccessible; no valid external device tokens
AI rewrite/chat	BR-018 and AI portion of BR-007	AI routes disabled and cannot consume provider budget
Web search	BR-019	Search disabled and UI makes no verification claim
Cloud EPUB upload/sync	BR-008–BR-012 in large part	Product is explicitly local-only; cloud mutation routes inaccessible
Local PDF/evidence	BR-020	Feature unavailable and no local evidence is created
Remote EPUB content	BR-030	Network/active content blocked by default

BR-001–BR-004, BR-013–BR-017, the applicable header/support minimum, and exact promotion/rollback remain mandatory for any public external-user surface that stores or processes user data.

5. Coverage map
Finding range	Backlog coverage
BR-001	B-001, B-002
BR-002	B-002, B-003, REL-030
BR-003	B-004, REL-030
BR-004	B-005, REL-030
BR-005–BR-006	P0-007
BR-007	P0-008
BR-008	P0-009
BR-009	P0-010
BR-010	P0-011
BR-011	P0-012
BR-012	P0-013
BR-013	P0-006
BR-014	P0-014
BR-015	P0-015
BR-016	P0-016
BR-017	P0-017
BR-018–BR-019	P0-008, P0-015, P1-018
BR-020	P0-014, P1-019
BR-021	P1-020
BR-022	P1-021
BR-023	P1-022
BR-024	P0-009, P1-023
BR-025–BR-026	B-002, P1-024
BR-027	P1-025
BR-028–BR-029	P1-026
BR-030	P0-009, P1-020, P2-027
BR-031–BR-032	P0-017, P2-028
6. Definition of completion

The backlog is complete only when:

every applicable finding has repository changes or a proven platform control;

every acceptance criterion has dated evidence;

Beta/public isolation is tested, not inferred;

backups have been restored, not merely created;

exact source/artifact/config/deployment identity is recorded;

rollback has been rehearsed;

user export and erasure have been exercised;

no first-user feature depends on an unresolved unverified platform assumption;

the bilateral judgment is updated from NO-SHIP to SHIP by the independent acceptor;

the public invite is sent only after post-deploy smoke passes.
