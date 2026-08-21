Dawn Reader — Claim and Source Ledger

Access date for all web sources: 2026-08-21
Evidence rule: Cloudflare, OWASP, W3C, GitHub, NIST, Apple, OpenAI, Brave, Wikimedia, and official project sources support bounded practices only. They do not prove live Sites configuration or runtime behavior.

1. Source ledger
ID	Source	Direct URL	Type/date	Supported scope	Limitation
S01	Cloudflare Workers — Environments	https://developers.cloudflare.com/workers/wrangler/environments/
	Official living documentation	Named environments can use distinct configuration/resources	Does not prove Sites exposes Wrangler environments or owner-only access
S02	Cloudflare Workers — Versions and Deployments	https://developers.cloudflare.com/workers/configuration/versions-and-deployments/
	Official living documentation	Separating immutable versions from deployments; deployment identity	Does not prove Sites exposes version IDs or artifact reuse
S03	Cloudflare Workers — Rollbacks	https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/
	Official living documentation	Application rollback to a prior version	Does not prove Sites exposes this rollback control
S04	Cloudflare Workers — Gradual Deployments	https://developers.cloudflare.com/workers/configuration/versions-and-deployments/gradual-deployments/
	Official living documentation	Versioned traffic promotion as a mature pattern	Gradual rollout is optional and may be excessive for one external user
S05	Cloudflare D1 — Migrations	https://developers.cloudflare.com/d1/reference/migrations/
	Official living documentation	Explicit ordered database migrations	Availability through current Sites workflow unverified
S06	Cloudflare D1 — Time Travel	https://developers.cloudflare.com/d1/reference/time-travel/
	Official living documentation	Point-in-time recovery capability and constraints	Enablement, retention, and Sites exposure unverified
S07	Cloudflare D1 — Import and Export	https://developers.cloudflare.com/d1/best-practices/import-export-data/
	Official living documentation	D1 data portability and backup procedures	Does not cover R2 or prove a completed restore
S08	Cloudflare D1 — Limits	https://developers.cloudflare.com/d1/platform/limits/
	Official living documentation	Service limits should inform capacity and request design	Limits may change and are not a substitute for user quotas
S09	Cloudflare Workers — Limits	https://developers.cloudflare.com/workers/platform/limits/
	Official living documentation	Runtime/request constraints	Exact Sites runtime plan and limits unverified
S10	Cloudflare R2 — Limits	https://developers.cloudflare.com/r2/platform/limits/
	Official living documentation	Object/storage request constraints	Does not impose application per-user quotas
S11	Cloudflare R2 — Object Lifecycles	https://developers.cloudflare.com/r2/buckets/object-lifecycles/
	Official living documentation	Automated object expiry as a retention tool	Current bucket lifecycle/versioning state unverified
S12	OWASP ASVS	https://owasp.org/www-project-application-security-verification-standard/
	Official verification standard, living project	Structured authentication, authorization, validation, and operational verification	Must be scoped; full certification was not performed
S13	OWASP CSRF Prevention Cheat Sheet	https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
	Official OWASP guidance	Same-origin, Origin/Referer, and anti-CSRF controls	Correct control depends on actual ChatGPT/Sites auth transport
S14	OWASP File Upload Cheat Sheet	https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
	Official OWASP guidance	Extension alone is insufficient; validate type, structure, names, limits, storage	EPUB-specific conformance also requires W3C/container checks
S15	OWASP REST Security Cheat Sheet	https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html
	Official OWASP guidance	Authentication, authorization, input validation, status and transport practices	Does not define Dawn-specific API semantics
S16	OWASP Logging Cheat Sheet	https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
	Official OWASP guidance	Security-relevant logs, correlation, exclusion of secrets/sensitive data	Actual platform log facilities and retention unverified
S17	OWASP Secrets Management Cheat Sheet	https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
	Official OWASP guidance	Credential lifecycle, rotation, least privilege, revocation	Device-token design remains application-specific
S18	OWASP API4:2023 Unrestricted Resource Consumption	https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/
	Official OWASP API Security 2023	Per-request, per-user, concurrency, size, and cost limits	Does not prescribe exact Dawn quota values
S19	OWASP API6:2023 Sensitive Business Flows	https://owasp.org/API-Security/editions/2023/en/0xa6-unrestricted-access-to-sensitive-business-flows/
	Official OWASP API Security 2023	Abuse controls around token/device creation and destructive flows	Pairing implementation must be designed for Dawn
S20	OWASP Secure Headers Project	https://owasp.org/www-project-secure-headers/
	Official OWASP project	Header categories and deployment guidance	Live Sites edge may add or override headers
S21	OWASP HTML5 Security Cheat Sheet	https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html
	Official OWASP guidance	Browser storage is origin/profile accessible and unsuitable for secrets	Does not replace browser-specific testing
S22	NIST SP 800-61r3 — Incident Response	https://csrc.nist.gov/pubs/sp/800/61/r3/final
	NIST final publication, 2025	Preparation, detection, response, recovery, and improvement	Report adopts a small-team subset rather than a full enterprise program
S23	WCAG 2.2	https://www.w3.org/TR/WCAG22/
	W3C Recommendation, 2023-10-05	Keyboard, focus, zoom/reflow, contrast, input, target, and status criteria	No conformance audit was performed
S24	EPUB 3.3	https://www.w3.org/TR/epub-33/
	W3C Recommendation, 2023-05-25	EPUB container/publication requirements	Does not alone define secure upload limits
S25	EPUB Accessibility 1.1	https://www.w3.org/TR/epub-a11y-11/
	W3C Recommendation, 2023-05-25	Accessibility metadata and publication requirements	Imported publications may themselves be inaccessible
S26	EPUB Reading Systems 3.3	https://www.w3.org/TR/epub-rs-33/
	W3C Recommendation, 2023-05-25	Reading-system handling, scripting, resources, and security considerations	Browser/epub.js behavior still requires runtime testing
S27	GitHub Actions Security Hardening	https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions
	Official living documentation	Pinning actions, token permissions, workflow trust	Does not prove repository settings are configured
S28	GitHub Artifact Attestations	https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations
	Official living documentation	Binding build provenance to artifacts	Plan/account support and Sites integration unverified
S29	GitHub Dependency Review	https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/about-dependency-review
	Official living documentation	PR dependency-delta review	Does not cover every SwiftPM risk automatically
S30	GitHub Rulesets	https://docs.github.com/en/repositories/configuring-branches-and-merges/in-your-repository/managing-rulesets/about-rulesets
	Official living documentation	Protected refs and required checks	Actual repository rulesets were not inspected
S31	GitHub Supply-Chain Security	https://docs.github.com/en/code-security/supply-chain-security
	Official living documentation	Dependency inventory and update governance	Requires project-specific implementation
S32	MDN Content Security Policy	https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
	Technical reference, living	CSP deployment, report-only migration, source restrictions	Browser support and EPUB iframe behavior require tests
S33	MDN Cache-Control	https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control
	Technical reference, living	Private/no-store/cache semantics	Actual CDN cache key and Sites behavior unverified
S34	MDN IndexedDB API	https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
	Technical reference, living	Browser-local structured/blob storage behavior	User/profile/device privacy depends on browser context
S35	IETF HTTPAPI Idempotency-Key Draft	https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/
	Internet-Draft	Standardized concept for request idempotency	Draft, not a final standard; operation journal remains Dawn-specific
S36	Apple Keychain Data Protection	https://support.apple.com/guide/security/keychain-data-protection-secb0694df1a/web
	Official Apple security guide	Keychain protection and access-control context	Exact Dawn Keychain accessibility class and device policy unverified
S37	OpenAI Privacy Policy	https://openai.com/policies/privacy-policy/
	Official policy, living	Disclosure reference when OpenAI processes identity/service data	Does not describe Dawn’s configured third-party AI provider
S38	Brave Search API Documentation	https://api.search.brave.com/app/documentation/web-search/get-started
	Official API documentation, living	Brave Search request/configuration behavior	Retention/contracts for the deployed account were not reviewed
S39	MediaWiki REST API	https://www.mediawiki.org/wiki/API:REST_API
	Official project documentation, living	Wikipedia REST fallback identity and capabilities	Does not establish completeness or reliability of search results
S40	Calibre-Web	https://github.com/janeczku/calibre-web
	Official project repository, living	Mature self-hosted reader with user/admin and access concepts	Repository state is moving; shared-library model is not Dawn’s target
S41	Calibre-Web-Automated	https://github.com/crocodilestick/Calibre-Web-Automated
	Official project repository, living	Operational ingestion/automation and recovery patterns	Watched-folder/conversion scope should not be copied into Dawn
S42	Kavita	https://github.com/Kareadita/Kavita
	Official project repository, living	Multi-user/admin and self-hosted library operations	Broad media-library scope is non-transferable
S43	Kavita Wiki	https://wiki.kavitareader.com/
	Official project documentation, living	Configuration, users, backups, and operations	Specific deployment assumptions differ from Sites
S44	Audiobookshelf	https://github.com/advplyr/audiobookshelf
	Official project repository, living	Multi-user self-hosted service and operational patterns	Audio streaming/transcoding is outside Dawn scope
S45	Audiobookshelf Documentation	https://www.audiobookshelf.org/docs/
	Official project documentation, living	User/admin, backup, and operating expectations	Documentation evolves; no feature-by-feature audit was claimed
S46	Komga	https://github.com/gotson/komga
	Official project repository, living	Per-user library/progress concepts	Shared-server library model is not adopted
S47	Komga Documentation	https://komga.org/docs/
	Official project documentation, living	Authentication, users, libraries, reading progress	Deployment architecture differs
S48	BookLore	https://github.com/booklore-app/booklore
	Official project repository, living	Account/admin and self-hosted operational patterns	Project maturity and moving state require rechecking before implementation
S49	KOReader	https://github.com/koreader/koreader
	Official project repository, living	Offline-first reader and device sync concepts	Plugin/device architecture is non-transferable
S50	KOReader Wiki	https://github.com/koreader/koreader/wiki
	Official project wiki, living	Operational and sync usage context	Wiki claims may lag releases
S51	Readium	https://readium.org/
	Official project site, living	Publication standards, locators, accessibility, interoperability	Does not require replacing epub.js or Dawn architecture
S52	Readium GitHub	https://github.com/readium
	Official organization repositories, living	Locator and reading-system implementation references	Multiple repositories/spec versions require selection during implementation
S53	Zotero Sync	https://www.zotero.org/support/sync
	Official product documentation, living	Separating data sync from file sync; conflict expectations	Zotero’s object model differs from Dawn
S54	Zotero Data	https://www.zotero.org/support/zotero_data
	Official product documentation, living	Local ownership, backup, export, and recovery expectations	Not a legal erasure specification
2. Material claim mapping
Claim	Repository evidence	External support	Classification
Beta/public data must be isolated	Fixed single-project manifest and no separate preview: .openai/hosting.json; docs/development-workflow.md	S01, S12	Recommendation grounded in concrete shared-blast-radius risk
Exact source SHA alone is insufficient	Hosting/config enters build; no artifact/deploy mapping	S02, S03, S28	Repository fact plus release-engineering inference
Runtime DDL is not a safe deployment migration system	db/index.ts:13-31	S05, S07	Repository fact plus sourced practice
A backup is not proven until restored	No restore workflow found	S06, S07, S11, S22	Sourced practice
Device token hashing is positive but not a full lifecycle	deviceAuth.ts; db/schema.ts	S15, S17	Repository fact and security assessment
Device creation needs abuse controls	app/api/devices/route.ts	S13, S18, S19	Repository-specific recommendation
AI and mutation routes need size/rate/cost limits	AI/API routes lack them	S08–S10, S18	Repository fact plus sourced practice
Extension and compressed-size checks are insufficient for EPUB	app/api/books/route.ts	S14, S24, S26	Directly supported
Per-file limit is not aggregate quota	40 MiB limit, no aggregate accounting	S10, S18	Directly supported
Cross-store operations need idempotency/reconciliation	Sequential D1/R2 code	S15, S35	Repository-specific systems inference
Web/iOS can null each other’s locator	Web omits native locator; iOS sets CFI nil; server replaces fields	S49–S53 as comparator context	Direct repository fact
Client-clock LWW is conflict-prone	Progress route and iOS comparison	S49, S53	Repository fact plus systems inference
Whole-state read/merge/write can lose updates	app/api/state/route.ts	S15, S53	Repository fact plus concurrency inference
Identity-header and CSRF boundaries require live proof	chatgpt-auth.ts; no common origin control	S12, S13, S15	Evidence gap plus recommendation
User deletion is not complete account erasure	Book-only deletion; multiple stores	S53, S54	Direct repository fact
Current documentation understates cloud/AI data flow	docs/reader-mvp.md versus current routes/storage	S37–S39	Direct repository contradiction
Content-bearing logs should be excluded	Raw error paths; no logging policy	S16, S22	Repository gap plus sourced practice
Incident response must be rehearsed	General SECURITY.md, no runbook	S17, S22	Repository gap plus sourced practice
Search “configured” state is inaccurate	webSearchConfigured() behavior	S38, S39	Direct repository fact
Browser local deletion must cover all IndexedDB/localStorage stores	Multiple independent stores	S21, S34	Direct repository fact plus recommendation
Security/cache headers need runtime verification	No repo policy; live edge unknown	S20, S32, S33	Evidence gap
Accessibility requires separate reader-surface testing	Roadmap unfinished; distinct stacks	S23, S25, S26	Repository gap plus sourced standard
Compressed EPUB size does not bound expanded work	40 MiB compressed upload only	S09, S14, S24	Directly supported
iOS hard-coded public URL defeats environment isolation	DawnSyncClient.swift	S01 conceptually	Direct repository fact
Web CI does not prove iOS	Workflows and docs	S27, S30	Direct repository fact
Mutable action tags weaken provenance	workflow @v4 refs	S27, S28	Directly supported
SwiftPM/dependency governance is incomplete	Dependabot covers npm/actions only	S29, S31	Repository fact
EPUB remote/active content needs an explicit policy	Media support, no complete policy	S14, S26, S32	Evidence gap plus recommendation
Retention must not remove live deletion barriers	tombstones/devices lack policy	S11, S16	Repository-specific inference
3. Comparator transfer matrix
Comparator	Source IDs	Transferable practice	Non-transferable practice
Calibre-Web	S40	User/admin distinction; controlled access	Shared master library and broad server features
Calibre-Web-Automated	S41	Ingestion staging and recoverability	Untrusted watched-folder automation and conversion breadth
Kavita	S42, S43	Role boundaries, backup/admin operations	Comics/manga/media product expansion
Audiobookshelf	S44, S45	User permissions, backups, operational visibility	Audio streaming/transcoding/podcast stack
Komga	S46, S47	Per-user access and progress separation	Shared server-library architecture
BookLore	S48	Account/admin and self-hosted health patterns	Unrelated feature breadth
KOReader	S49, S50	Offline-first behavior and explicit sync concepts	Device/plugin architecture
Readium	S51, S52	Locators, EPUB conformance, accessibility	Wholesale reader rewrite
Zotero	S53, S54	Data/file sync distinction, export, backup, local ownership	Citation and research-database functionality
4. Explicit source limitations and unavailable evidence

The following were not available as retained, citable primary-source proof and remain unverified:

exact Sites documentation for creating an owner-only project;

exact Sites documentation for selecting a target project independently of .openai/hosting.json;

exact Sites documentation for immutable deployment versions, artifact reuse, and rollback;

exact Sites exposure of D1 migration, Time Travel, export/import, and restore controls;

exact Sites behavior for identity-header stripping/authenticity;

the live project’s response headers, cache behavior, resource IDs, access rules, deployment history, and secrets;

provider-account retention and contractual terms;

production data contents and backup state;

current repository branch/ruleset configuration outside tracked files;

signed iOS build behavior.

Cloudflare sources S01–S11 are used as underlying-service design references only. They must not be cited as proof that the current Sites product exposes each feature.

5. Source-use constraints

A comparator’s existence does not prove Dawn should copy its architecture.

A security standard identifies a verification area; it does not prove Dawn fails a live control that may be supplied by the platform.

Repository absence establishes that a control is not implemented or documented in the tracked tree, not necessarily that the hosting platform supplies no equivalent.

Current product/provider claims must be rechecked at implementation and release time because living documentation can change.

No source supports sharing Beta and public user data as a safe shortcut.
