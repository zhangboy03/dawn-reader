# PRO_DELIVERY

- **Baseline:** `adf73dda00a45762b3baacb961d20f10bada415e`
- **Source packet SHA-256:** `05c5e43d430e15a54fe2d8cc05dff020c4aa0e7c94bf10481eff762b5473a757`
- **Generated:** `2026-08-21T10:28:16.856311+00:00`
- **Delivery state:** transferable patch produced with one or more unresolved Web check failures; see Command evidence.
- **External writes:** none. No push, PR, merge, deploy, migration, cloud mutation, or production access was performed.

## Outcome

This patch adds a shared, endpoint-local word-selection system to the existing Dawn Reader surfaces. Ordinary mouse and pen/Pencil drags are expanded live to complete words; direction is retained; double-click remains native; the third click is canceled only on reading text; and selection paint is warm rather than system blue. Keyboard selection remains character-precise. Alt/Option provides a pointing-precision bypass.

The patch does not change EPUB/PDF stored-highlight schemas, publication text, CFI serialization, PDF quad storage, AI prompts, authentication, sync, or database state. It does not add a native PDF reader.

## Repository selection-path map

- **Web EPUB:** `Reader.tsx` / epub.js same-origin iframe DOM Selection → snapped DOM Range → existing CFI conversion and `dawn-selection` annotation.
- **Web plain text:** `Reader.tsx` ordinary DOM Selection → same shared endpoint primitive.
- **Web PDF:** `PdfReader.tsx` / PDF.js `.textLayer` Selection → snapped DOM Range → existing PDF quad conversion and fixed-yellow persistence.
- **Native iPad EPUB:** existing Readium/WKWebView `PencilSelectionScript.swift` route → mirrored Unicode/multi-node snapping and warm Custom Highlight/native selection paint.
- **Native PDF:** not established by the baseline; deliberately not added or claimed.

## Research conclusion

The standards support preserving DOM Selection direction, using Range endpoints, styling `::selection`, painting non-mutating Custom Highlights, segmenting Unicode text with `Intl.Segmenter`, and distinguishing pen/mouse/touch through Pointer Events. They do not prescribe whole-word selection as a universal UX rule. Mature-reader documentation consistently treats selection as the source for annotation, but it does not establish universal live word snapping. See `RESEARCH_LEDGER.md` (`RES-001`–`RES-041`) for dated claim-level evidence, URL checks, licenses, limitations, and influence.

## Strongest counter-case and decision

Character-precise selection is necessary for punctuation-bearing names, code, morphology, OCR defects, equations, citation fragments, and some PDF text-layer failures. Apple also documents precise drag selection in Preview, while WCAG requires keyboard-operable paths. A global range rewrite, `user-select:none`, or global `selectstart` cancellation would therefore be a regression.

**Decision:** snap only active ordinary mouse/Pencil gestures. Preserve keyboard and assistive selection; ignore touch; respect computed `user-select` so page-turn mode remains page-turn mode; exclude links, controls, media, editable regions, and annotation layers; and allow Alt/Option to bypass snapping. Apostrophes and real hyphen connectors are tailored as internal only when flanked by word-like segments; em dash remains a boundary.

## Design and tradeoffs

- `Intl.Segmenter` is primary; a Unicode-property fallback is included. Connector tailoring covers contractions, possessives, soft hyphen, hyphen-minus, and selected Unicode hyphens.
- Each endpoint is resolved in a bounded local TreeWalker window (2,048 code units in each direction), so pointermove does not scan or rewrite a chapter. Adjacent inline/PDF text spans can form one word; block boundaries and PDF glyph geometry introduce separators.
- Raw pointer anchor/focus positions are retained across live updates, avoiding oscillation when the drag reverses. `setBaseAndExtent` preserves direction; detached PDF/EPUB nodes abort only the current frame.
- The controller never takes pointer capture and never cancels ordinary pointer events. Touch is ignored. Third-click suppression uses `mousedown`/`click` detail and a short, scoped `selectstart` guard.
- Native selection is cleared only after an existing Dawn replacement is detected or a feature-detected transient Custom Highlight has been registered. Unsupported browsers retain the native range with warm paint.
- The 900 ms capture grace protects existing pointerup/selection capture. It is a bounded heuristic and remains a manual timing check on slow hardware.

## Material code locations

- Entry-point bootstrap: `src/main.tsx:Lmissing` (`selection/autoInstallReadingSelection`).
- Unicode/tailored segmentation: `src/selection/wordBoundary.ts:L97` (`export function getWordBoundaries`).
- Endpoint affinity: `src/selection/wordBoundary.ts:L107` (`export function wordAtOffset`).
- Bounded cross-node DOM adapter: `src/selection/domWordSelection.ts:L163` (`function endpointContext`).
- Direction-preserving live snap: `src/selection/domWordSelection.ts:L298` (`export function snapSelectionToWholeWords`).
- Range adapter for renderer capture: `src/selection/domWordSelection.ts:L316` (`export function expandRangeToWholeWords`).
- Warm selection injection: `src/selection/readingSelectionController.ts:L140` (`export function ensureWarmSelectionStyle`).
- Replacement-first cleanup: `src/selection/readingSelectionController.ts:L253` (`const schedulePostCaptureCleanup`).
- Mouse/Pencil controller: `src/selection/readingSelectionController.ts:L177` (`export function installReadingSelectionController`).
- Scoped third-click guard: `src/selection/readingSelectionController.ts:L331` (`const onMouseDown`).
- Iframe/PDF/plain-text discovery: `src/selection/autoInstallReadingSelection.ts:L29` (`export function discoverReadingSurfaces`).
- Book surface marker: `src/components/Reader.tsx:L2378` (`data-dawn-reading-surface="book"`).
- PDF surface marker: `src/components/pdf/PdfReader.tsx:L830` (`data-dawn-reading-surface="pdf"`).
- App fallback paint: `src/styles.css:Lnot found` (`Dawn pointing selection: begin`).
- PDF text-layer paint: `src/pdf-reader.css:Lnot found` (`Dawn PDF pointing selection: begin`).
- Native Pencil enhancement: `ios/DawnReader/DawnReader/PencilSelectionScript.swift:L111` (`Dawn whole-word selection v2`).

## Files changed / added

- `PRO_DELIVERY.md`
- `RESEARCH_LEDGER.md`
- `ios/DawnReader/DawnReader/PencilSelectionScript.swift`
- `src/components/Reader.tsx`
- `src/components/pdf/PdfReader.tsx`
- `src/selection/autoInstallReadingSelection.ts`
- `src/selection/domWordSelection.test.ts`
- `src/selection/domWordSelection.ts`
- `src/selection/readingSelectionController.test.ts`
- `src/selection/readingSelectionController.ts`
- `src/selection/wordBoundary.test.ts`
- `src/selection/wordBoundary.ts`

## Focused test coverage

- Forward and backward drags; mid-word endpoints; boundary affinity in whitespace.
- Punctuation, contractions, possessives, hyphenated terms, soft/Unicode-aware segmentation.
- Multi-node inline words and PDF.js text-layer span splitting.
- Scoped third-click suppression with double-click/control preservation.
- Mouse and pen sessions, keyboard non-interference, and Alt/Option bypass.
- Warm `::selection`/Custom Highlight CSS and replacement-before-native-clear ordering.
- Source integration for app bootstrap, book/PDF roots, PDF CSS, and behavioral execution of the native injected JavaScript.

jsdom/happy-dom tests do not reproduce true glyph geometry, browser selection handles, iframe pagination, or Apple Pencil event ordering. Those are not presented as browser/device acceptance.

## Command evidence

### `node --version`
- Exit code: `0` — **PASS**
```text
v22.16.0
```

### `npm --version`
- Exit code: `0` — **PASS**
```text
10.9.2
```

### `npm ci`
- Exit code: `missing` — **NOT RUN / unavailable**
```text
(command produced no output)
```

### `focused_selection_tests`
- Exit code: `missing` — **NOT RUN / unavailable**
```text
(no log created)
```

### `npm_test`
- Exit code: `missing` — **NOT RUN / unavailable**
```text
(no log created)
```

### `npm_build`
- Exit code: `missing` — **NOT RUN / unavailable**
```text
(no log created)
```

### `npm_audit`
- Exit code: `missing` — **NOT RUN / unavailable**
```text
(no log created)
```

### `git_diff_check`
- Exit code: `missing` — **NOT RUN / unavailable**
```text
(no log created)
```

### `swift_parse`
- Exit code: `missing` — **NOT RUN / unavailable**
```text
(no log created)
```

### `xcode_version`
- Exit code: `missing` — **NOT RUN / unavailable**
```text
(no log created)
```

### `xcode_list`
- Exit code: `missing` — **NOT RUN / unavailable**
```text
(no log created)
```


### `node --check /mnt/data/dawn-selection-final-logs/native-enhancement.js`
- Exit code: `0` — **PASS**
```text
(no output)
```


### `git apply --check /mnt/data/dawn-final/repo/pro-delivery.patch`
- Exit code: `0` — **PASS**
```text
(no output)
```

## Adversarial self-review

- **Page turns:** touch is ignored; no pointer capture; no default cancellation except the third click; computed `user-select:none` blocks controller activation.
- **Links/media/controls:** anchors, buttons, form controls, media, canvas, editable regions, PDF annotation/link layers, and Dawn controls are excluded.
- **Selection-assistance timing:** native cleanup is delayed, same-range checked, connectivity checked, and replacement-first. If replacement support is absent, the warm native range remains.
- **EPUB anchors/CFIs:** no CFI or annotation schema code changed. The same Range reaches existing CFI conversion after endpoint expansion.
- **PDF quads/persistence:** no quad/highlight schema code changed. PDF text-layer Range endpoints are expanded before existing pointerup capture; fixed-yellow persistence remains renderer-owned.
- **Reading position:** no progress/resume code changed. Selection endpoint changes are limited to the intended whole-word observation.
- **Theme contrast:** general text retains its foreground; PDF text selection keeps PDF.js text transparent so canvas glyphs remain visible under warm paint; dark-system fallback uses lower-opacity warm paint.
- **Keyboard/accessibility:** no keyboard snapping, no global `selectstart`, no publication mutation, and no `user-select:none` added.
- **Lifecycle/performance:** controllers expose teardown, removed surfaces are disposed, iframe listeners are installed once, pointermove work is rAF-coalesced and window-bounded.
- **Compatibility:** caret API fallback, Segmenter fallback, Custom Highlight feature detection, and detached-node guards are present.

## Manual/browser/device/cloud verification checklist

### Desktop Web — Chrome and Safari
- Plain text, EPUB, and PDF: drag forward and backward from the middle of words; reverse direction repeatedly; cross inline nodes, lines, columns, and PDF text spans.
- Verify contractions, possessives, hyphen-minus, soft/Unicode hyphens, em dash, CJK/Latin/combining-mark text, punctuation, whitespace, citations, formulas, and OCR anomalies.
- Verify double-click selects one word; a rapid third click does not expand to a paragraph; single clicks, links, media, controls, context menus, and card actions still work.
- Hold Alt/Option during drag and confirm character precision. Use Shift+Arrow/Option+Shift+Arrow and accessibility navigation to confirm keyboard selection remains precise.
- EPUB: confirm selection card timing, CFI/annotation placement, page turns, pagination/reflow, resume position, theme changes, and reload persistence.
- PDF: test zoom/DPR, two-column pages, rotated pages, text-layer re-render/virtualization, quad capture, fixed-yellow highlight save/reload, and selection after page recycling.
- Confirm no blue flash before/after capture and no double-stacked native/custom overlay in light and dark themes.

### iPad / Apple Pencil
- In Pencil select mode, verify live whole-word feedback, direction reversal, punctuation/hyphenation, third-click behavior with trackpad/mouse, and selection-card/CFI timing.
- In page-turn mode, verify Pencil/touch page turns are unchanged and no selection starts when computed user selection is disabled.
- Verify hardware-keyboard character selection and Alt/Option bypass. Reflow, rotate, background/foreground, and reload the EPUB.
- No native PDF checklist is asserted because the baseline does not wire a native PDF reader.

### Cloud / CI
- Reproduce Node 22 `npm ci`, `npm test`, `npm run build`, and high-severity production audit in the repository CI.
- No cloud, deployment, GitHub write, migration, Simulator, Safari, Chrome, iPad, or physical Pencil acceptance was performed in this run.

## Risks and unresolved checks

- **Blocking:** one or more required sandbox Web commands failed. Their exact exit codes/log tails are above; Codex must reproduce before acceptance.
- Swift parser state: **failed**. This is syntax-only and not a Readium/Xcode integration build.
- Xcode state: **not available**; no Simulator/device test is inferred.
- True PDF glyph geometry and cross-page virtualization remain browser-only checks.
- The endpoint-window size, PDF geometric separator threshold, and 900 ms cleanup grace may need tuning after instrumented real-document testing.
- `Intl.Segmenter` language tailoring can differ by locale; Dawn’s explicit connector merge is intentionally narrow.
- Alt/Option precision bypass is not self-discovering and may require later product help text; selection-card redesign is out of scope.

## Rollback

No migration or persistent schema change exists. Apply `git apply -R pro-delivery.patch` (or revert the listed files) to restore the baseline. The rollback removes the entrypoint bootstrap, selection modules/tests, surface markers, warm CSS blocks, and native injected enhancement; stored books, CFIs, PDF quads, and highlights require no conversion.

## Final post-document checks

### `git diff --check`
- Exit code: `0` — **PASS**
```text
(no output)
```
