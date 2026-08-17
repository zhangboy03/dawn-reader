import type { ReaderSettings } from "./readerSettings";

const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
const TYPOGRAPHY_STYLE_ID = "dawn-reader-typography";
const EXEMPT_ATTRIBUTE = "data-dawn-typography-exempt";
const PRESERVE_ALIGN_ATTRIBUTE = "data-dawn-preserve-align";
const OPENING_ATTRIBUTE = "data-dawn-opening-paragraph";
const BODY_BLOCK_ATTRIBUTE = "data-dawn-body-block";
const SOURCE_INDENT_ATTRIBUTE = "data-dawn-source-indent";

const semanticExceptionPattern = /(?:^|[\s_-])(poem|poetry|verse|stanza|linegroup|line-group|lyrics?|dedication|epigraph|titlepage|subtitle|caption|code|formula|math|table|toc|contents|footnote|endnote|bibliograph|drama|stage|speaker|letter)(?:$|[\s_-])/i;
const noIndentPattern = /(?:^|[\s_-])(noindent|no-indent|first|firstpara|first-para|opening|lead)(?:$|[\s_-])/i;
const explicitAlignPattern = /(?:^|[\s_-])(center|centered|right|end)(?:$|[\s_-])/i;

export const EPUB_TYPOGRAPHY_CSS = `
:root[data-dawn-typography-mode="dawn"][data-dawn-language="english"] {
  font-family: "Iowan Old Style", Baskerville, Georgia, serif !important;
  font-kerning: normal;
  text-rendering: optimizeLegibility;
}

:root[data-dawn-typography-mode="dawn"][data-dawn-language="english"] body {
  font-family: inherit !important;
}

:root[data-dawn-typography-mode="dawn"][data-dawn-language="english"][data-dawn-text-align="justify"] body {
  text-align: justify !important;
  -webkit-hyphens: auto !important;
  hyphens: auto !important;
  hyphenate-limit-chars: 6 3 3;
}

:root[data-dawn-typography-mode="dawn"][data-dawn-language="english"][data-dawn-text-align="justify"] :is(p:not([data-dawn-typography-exempt]), [data-dawn-body-block]) {
  text-align: justify !important;
  -webkit-hyphens: auto !important;
  hyphens: auto !important;
}

:root[data-dawn-typography-mode="dawn"][data-dawn-language="english"][data-dawn-text-align="start"] body {
  text-align: start !important;
  -webkit-hyphens: none !important;
  hyphens: none !important;
}

:root[data-dawn-typography-mode="dawn"][data-dawn-language="english"][data-dawn-text-align="start"] :is(p:not([data-dawn-typography-exempt]), [data-dawn-body-block]) {
  text-align: start !important;
  -webkit-hyphens: none !important;
  hyphens: none !important;
}

:root[data-dawn-typography-mode="dawn"][data-dawn-language="english"] :is(p:not([data-dawn-typography-exempt]), [data-dawn-body-block]) {
  font-family: inherit !important;
  font-size: inherit !important;
  line-height: inherit !important;
  padding-right: 0 !important;
  padding-left: 0 !important;
  letter-spacing: normal !important;
  word-spacing: normal !important;
  orphans: 2;
  widows: 2;
  text-wrap: pretty;
}

:root[data-dawn-typography-mode="dawn"][data-dawn-language="english"] p[data-dawn-typography-exempt] {
  margin-top: 0 !important;
  margin-bottom: .75em !important;
  padding-right: 0 !important;
  padding-left: 0 !important;
  text-indent: 0 !important;
  letter-spacing: normal !important;
  word-spacing: normal !important;
}

:root[data-dawn-typography-mode="dawn"][data-dawn-language="english"][data-dawn-paragraph-style="book"] :is(p:not([data-dawn-typography-exempt]), [data-dawn-body-block]) {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  text-indent: 1.25em !important;
}

:root[data-dawn-typography-mode="dawn"][data-dawn-language="english"][data-dawn-paragraph-style="book"] :is(p[data-dawn-opening-paragraph], [data-dawn-body-block][data-dawn-opening-paragraph], [data-dawn-body-block][data-dawn-source-indent]) {
  text-indent: 0 !important;
}

:root[data-dawn-typography-mode="dawn"][data-dawn-language="english"][data-dawn-paragraph-style="spaced"] :is(p:not([data-dawn-typography-exempt]), [data-dawn-body-block]) {
  margin-top: 0 !important;
  margin-bottom: .75em !important;
  text-indent: 0 !important;
}

:root[data-dawn-typography-mode="dawn"][data-dawn-language="english"] :is(h1, h2, h3, h4, h5, h6):not([data-dawn-preserve-align]),
:root[data-dawn-typography-mode="dawn"][data-dawn-language="english"] :is(li, dt, dd, figcaption, th, td):not([data-dawn-preserve-align]),
:root[data-dawn-typography-mode="dawn"][data-dawn-language="english"] [data-dawn-typography-exempt]:not([data-dawn-preserve-align]) {
  text-align: start !important;
}

:root[data-dawn-typography-mode="dawn"][data-dawn-language="english"] :is(h1, h2, h3, h4, h5, h6),
:root[data-dawn-typography-mode="dawn"][data-dawn-language="english"] [data-dawn-typography-exempt] {
  -webkit-hyphens: none !important;
  hyphens: none !important;
}

:root[data-dawn-typography-mode="dawn"][data-dawn-language="english"] :is(h1, h2, h3, h4, h5, h6) {
  font-family: inherit !important;
  line-height: 1.15 !important;
  letter-spacing: normal !important;
  word-spacing: normal !important;
  break-after: avoid-page;
  page-break-after: avoid;
  text-wrap: balance;
}

:root[data-dawn-typography-mode="dawn"][data-dawn-language="english"] :is(pre, code, kbd, samp) {
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace !important;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

:root[data-dawn-typography-mode="dawn"] :is(img, svg, video, table) {
  max-width: 100% !important;
}

:root[data-dawn-typography-mode="dawn"] :is(a, code, pre, td, th) {
  overflow-wrap: anywhere;
}
`;

export function normalizePublicationLanguage(value: unknown): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== "string") return null;
  const normalized = candidate.trim().replace(/_/g, "-");
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(normalized) ? normalized : null;
}

export function isEnglishLanguage(value: unknown) {
  const language = normalizePublicationLanguage(value);
  return Boolean(language && /^en(?:-|$)/i.test(language));
}

function authoredAlignment(element: Element) {
  const attribute = element.getAttribute("align")?.toLowerCase();
  const inline = (element as HTMLElement).style?.textAlign?.toLowerCase();
  const signature = `${element.getAttribute("class") ?? ""} ${element.id}`;
  return ["center", "right", "end"].includes(attribute ?? "")
    || ["center", "right", "end"].includes(inline ?? "")
    || explicitAlignPattern.test(signature);
}

function markElement(element: Element) {
  element.setAttribute(EXEMPT_ATTRIBUTE, "true");
  if (authoredAlignment(element)) element.setAttribute(PRESERVE_ALIGN_ATTRIBUTE, "true");
  for (const descendant of element.querySelectorAll("p, li, dt, dd, figcaption, th, td")) {
    descendant.setAttribute(EXEMPT_ATTRIBUTE, "true");
    if (authoredAlignment(descendant)) descendant.setAttribute(PRESERVE_ALIGN_ATTRIBUTE, "true");
  }
}

function markTypographyExceptions(document: Document) {
  for (const element of document.querySelectorAll("h1, h2, h3, h4, h5, h6, pre, code, kbd, samp, math, table, figure, figcaption, nav, aside, blockquote, dt, dd, th, td")) {
    markElement(element);
  }

  for (const element of document.querySelectorAll("[class], [id], [role], [epub\\:type]")) {
    const signature = [
      element.getAttribute("class"),
      element.id,
      element.getAttribute("role"),
      element.getAttribute("epub:type"),
    ].filter(Boolean).join(" ");
    if (semanticExceptionPattern.test(signature)) markElement(element);
  }

  for (const paragraph of document.querySelectorAll("p")) {
    if (paragraph.querySelectorAll("br").length >= 2) markElement(paragraph);
  }
}

function markParagraphLikeDivs(document: Document) {
  const blockContent = ":scope > p, :scope > div, :scope > section, :scope > article, :scope > aside, :scope > blockquote, :scope > figure, :scope > table, :scope > ul, :scope > ol, :scope > dl, :scope > pre, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6";
  const mediaContent = "img, video, audio, iframe, svg, canvas, math, input, textarea, select, button";
  for (const element of document.querySelectorAll<HTMLDivElement>(`div:not([${EXEMPT_ATTRIBUTE}])`)) {
    const text = element.textContent ?? "";
    if (text.trim().length < 20 || element.querySelector(blockContent) || element.querySelector(mediaContent)) continue;
    element.setAttribute(BODY_BLOCK_ATTRIBUTE, "true");
    const leadingWhitespace = text.match(/^[\s\u00a0]*/u)?.[0] ?? "";
    if ((leadingWhitespace.match(/\u00a0/gu) ?? []).length >= 2) {
      element.setAttribute(SOURCE_INDENT_ATTRIBUTE, "true");
    }
  }
}

function markOpeningParagraphs(document: Document) {
  const openingPredecessor = "h1, h2, h3, h4, h5, h6, hr, figure, table, blockquote, aside";
  for (const paragraph of document.querySelectorAll<HTMLElement>(`p:not([${EXEMPT_ATTRIBUTE}]), [${BODY_BLOCK_ATTRIBUTE}]`)) {
    const signature = `${paragraph.className} ${paragraph.id}`;
    const previous = paragraph.previousElementSibling;
    const firstBodyParagraph = paragraph.parentElement === document.body && !previous;
    if (noIndentPattern.test(signature) || firstBodyParagraph || previous?.matches(openingPredecessor)) {
      paragraph.setAttribute(OPENING_ATTRIBUTE, "true");
    }
  }
}

export type EpubTypographyOptions = Pick<ReaderSettings, "textAlign" | "paragraphStyle" | "typographyMode"> & {
  publicationLanguage?: unknown;
};

export function applyEpubTypographyDocument(document: Document, options: EpubTypographyOptions) {
  const root = document.documentElement;
  const documentLanguage = normalizePublicationLanguage(
    root.getAttribute("lang")
      || root.getAttributeNS(XML_NAMESPACE, "lang")
      || document.body?.getAttribute("lang"),
  );
  const publicationLanguage = normalizePublicationLanguage(options.publicationLanguage);
  const language = documentLanguage ?? publicationLanguage;

  if (!documentLanguage && publicationLanguage) root.setAttribute("lang", publicationLanguage);

  root.dataset.dawnTypographyMode = options.typographyMode;
  root.dataset.dawnLanguage = isEnglishLanguage(language) ? "english" : "other";
  root.dataset.dawnTextAlign = options.textAlign;
  root.dataset.dawnParagraphStyle = options.paragraphStyle;

  markTypographyExceptions(document);
  markParagraphLikeDivs(document);
  markOpeningParagraphs(document);

  let style = document.getElementById(TYPOGRAPHY_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = TYPOGRAPHY_STYLE_ID;
    style.textContent = EPUB_TYPOGRAPHY_CSS;
    (document.head ?? root).appendChild(style);
  }

  return {
    language,
    english: root.dataset.dawnLanguage === "english",
    exemptCount: document.querySelectorAll(`[${EXEMPT_ATTRIBUTE}]`).length,
  };
}
