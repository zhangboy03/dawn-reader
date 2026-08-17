import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { BookSource } from "./Library";
import type { ReaderProfile } from "../lib/storage";
import {
  loadReaderSettings,
  saveReaderSettings,
  type PencilMode,
  type ReaderSettings,
} from "../lib/readerSettings";
import { contextFromParagraphs, type RewriteContext } from "../lib/rewriteContext";
import { isSingleWord } from "../lib/selectionKind";
import { parseReadingPosition, saveReadingPosition } from "../lib/readingPosition";
import { restoredScrollTop, visualAnchorPoints } from "../lib/readingAnchor";
import {
  epubFrameSize,
  epubReflowAction,
  mergeEpubReflowRequest,
  type EpubFrameSize,
  type EpubReflowRequest,
} from "../lib/epubReflow";
import { loadCloudProgress, saveCloudProgress, saveCloudState } from "../lib/cloudSync";
import {
  pageNumberFromLocation,
  publisherPageNumber,
  type EpubPageNumber,
} from "../lib/epubPagination";
import {
  normalizeEpubToc,
  tocItemIsCurrent,
  type EpubTocItem,
} from "../lib/epubToc";
import {
  desktopPageTurnFromPointer,
  pageTurnFromKey,
  pageTurnFromPointer,
  pointerInputKind,
  shouldTurnPage,
  touchInputKind,
  type ReaderInputKind,
} from "../lib/pencilInput";
import {
  isEpubMediaControlTarget,
  prepareEpubMediaDocument,
  type EpubEmbedTarget,
  type EpubImageTarget,
} from "../lib/epubMedia";
import {
  applyEpubTypographyDocument,
  normalizePublicationLanguage,
} from "../lib/epubTypography";

type RewriteState = "idle" | "loading" | "complete" | "error";
type AssistanceMode = "english" | "chinese";
type ChatState = "idle" | "loading" | "error";
type ChatMessage = { role: "user" | "assistant"; content: string };
type ChatSource = { title: string; url: string };
type SelectionAnchor = { x: number; y: number; placement: "above" | "below" };
type GestureState = {
  kind: ReaderInputKind;
  mode: PencilMode;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startScrollLeft: number;
  touchSeen: boolean;
  completed: boolean;
  startedOnBlank: boolean;
  interactive: boolean;
  pointerId?: number;
};
type CaretPoint = { node: Node; offset: number };
type StageGesture = { startX: number; startY: number; width: number; pointerId: number };
type EpubAppearanceAnchor = { cfi: string; revision: number };
type TextAppearanceAnchor = {
  target: Node | HTMLElement;
  offset?: number;
  viewportTop: number;
};
type EpubImageView = Omit<EpubImageTarget, "element">;
type EpubEmbedView = Omit<EpubEmbedTarget, "element">;

function TocItems({
  items,
  currentHref,
  depth = 0,
  onNavigate,
}: {
  items: EpubTocItem[];
  currentHref: string;
  depth?: number;
  onNavigate: (item: EpubTocItem) => void;
}) {
  return <ul className="toc-list" data-depth={depth}>
    {items.map((item) => {
      const current = tocItemIsCurrent(item.href, currentHref);
      return <li key={item.id}>
        <button
          className={current ? "current" : ""}
          data-current={current || undefined}
          onClick={() => onNavigate(item)}
          aria-current={current ? "location" : undefined}
          style={{ paddingLeft: `${22 + Math.min(depth, 4) * 18}px` }}
        >
          <span>{item.label}</span>
          {current && <small>正在阅读</small>}
        </button>
        {item.subitems.length > 0 && <TocItems items={item.subitems} currentHref={currentHref} depth={depth + 1} onNavigate={onNavigate} />}
      </li>;
    })}
  </ul>;
}

function isPageTurnControlTarget(target: EventTarget | null) {
  const element = target as { closest?: (selector: string) => Element | null } | null;
  return Boolean(element?.closest?.("input, textarea, select, button, a, [contenteditable='true'], [role='slider']"));
}

function isDesktopReaderEnvironment() {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches && navigator.maxTouchPoints === 0;
}

function pointHitsReadableContent(document: Document, x: number, y: number) {
  const hit = document.elementFromPoint(x, y);
  if (!hit) return false;
  if (hit.closest("a, button, input, textarea, select, img, picture, svg, video, audio, canvas, iframe, [contenteditable='true']")) return true;
  const textRoot = hit.closest("p, li, blockquote, h1, h2, h3, h4, h5, h6, figcaption, td, th") ?? hit;
  const showText = document.defaultView?.NodeFilter.SHOW_TEXT ?? NodeFilter.SHOW_TEXT;
  const walker = document.createTreeWalker(textRoot, showText);
  let node = walker.nextNode();
  while (node) {
    if (node.textContent?.trim()) {
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of Array.from(range.getClientRects())) {
        if (x >= rect.left - 2 && x <= rect.right + 2 && y >= rect.top - 2 && y <= rect.bottom + 2) return true;
      }
    }
    node = walker.nextNode();
  }
  return false;
}

function caretPointFromCoordinates(document: Document, x: number, y: number): CaretPoint | null {
  const caretDocument = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = caretDocument.caretPositionFromPoint?.(x, y);
  if (position?.offsetNode) return { node: position.offsetNode, offset: position.offset };
  const range = caretDocument.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

function caretRange(document: Document, point: CaretPoint) {
  try {
    const range = document.createRange();
    range.setStart(point.node, point.offset);
    range.collapse(true);
    return range;
  } catch {
    return null;
  }
}

function viewportTopForTextAnchor(anchor: TextAppearanceAnchor) {
  if (anchor.target instanceof HTMLElement) return anchor.target.getBoundingClientRect().top;
  const document = anchor.target.ownerDocument;
  if (!document || anchor.offset === undefined) return null;
  const range = caretRange(document, { node: anchor.target, offset: anchor.offset });
  return range?.getBoundingClientRect().top ?? null;
}

function selectBetween(document: Document, start: CaretPoint, end: CaretPoint) {
  const selection = document.getSelection();
  if (!selection) return false;
  try {
    selection.setBaseAndExtent(start.node, start.offset, end.node, end.offset);
  } catch {
    const startRange = document.createRange();
    const endRange = document.createRange();
    startRange.setStart(start.node, start.offset);
    startRange.collapse(true);
    endRange.setStart(end.node, end.offset);
    endRange.collapse(true);
    const range = document.createRange();
    if (startRange.compareBoundaryPoints(Range.START_TO_START, endRange) <= 0) {
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
    } else {
      range.setStart(end.node, end.offset);
      range.setEnd(start.node, start.offset);
    }
    selection.removeAllRanges();
    selection.addRange(range);
  }
  return Boolean(selection.rangeCount && !selection.isCollapsed && selection.toString().trim());
}

const themeColors = {
  paper: { background: "#f4f2ea", color: "#292824" },
  sepia: { background: "#e9dfc8", color: "#342e25" },
  night: { background: "#1b1d1a", color: "#b8b2a8" },
};

function normalize(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function closestTextBlock(node: Node | null) {
  const element = node?.nodeType === 1 ? node as Element : node?.parentElement;
  return element?.closest<HTMLElement>("p, li, blockquote, h1, h2, h3, h4, h5, h6") ?? null;
}

function nearbyBlockText(block: HTMLElement | null, direction: "before" | "after") {
  let sibling = direction === "before" ? block?.previousElementSibling : block?.nextElementSibling;
  while (sibling) {
    const text = normalize(sibling.textContent ?? "");
    if (text) return text;
    sibling = direction === "before" ? sibling.previousElementSibling : sibling.nextElementSibling;
  }
  return "";
}

function contextFromDomSelection(selection: Selection, limit = 700): RewriteContext {
  if (!selection.rangeCount) return { before: "", after: "" };
  const range = selection.getRangeAt(0);
  const startBlock = closestTextBlock(range.startContainer);
  const endBlock = closestTextBlock(range.endContainer);
  const document = range.startContainer.ownerDocument;
  if (!document) return { before: "", after: "" };
  let beforeInBlock = "";
  let afterInBlock = "";

  if (startBlock) {
    const beforeRange = document.createRange();
    beforeRange.selectNodeContents(startBlock);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    beforeInBlock = beforeRange.toString();
  }
  if (endBlock) {
    const afterRange = document.createRange();
    afterRange.selectNodeContents(endBlock);
    afterRange.setStart(range.endContainer, range.endOffset);
    afterInBlock = afterRange.toString();
  }

  const before = normalize([nearbyBlockText(startBlock, "before"), beforeInBlock].filter(Boolean).join("\n"));
  const after = normalize([afterInBlock, nearbyBlockText(endBlock, "after")].filter(Boolean).join("\n"));
  return { before: before.slice(-limit), after: after.slice(0, limit) };
}

export function Reader({ source, profile, onClose }: { source: BookSource; profile: ReaderProfile; onClose: () => void }) {
  const epubRef = useRef<HTMLDivElement>(null);
  const readingStageRef = useRef<HTMLElement>(null);
  const bookRef = useRef<any>(null);
  const renditionRef = useRef<any>(null);
  const selectedCfiRef = useRef<string | null>(null);
  const selectedContentsRef = useRef<any>(null);
  const selectedContextRef = useRef<RewriteContext | null>(null);
  const rewriteAbortRef = useRef<AbortController | null>(null);
  const reflowTimerRef = useRef<number | null>(null);
  const appearanceRevisionRef = useRef(0);
  const epubReflowRevisionRef = useRef(0);
  const epubContentRevisionRef = useRef(0);
  const epubContentLayoutSignaturesRef = useRef<Set<string>>(new Set());
  const pendingEpubAppearanceAnchorRef = useRef<EpubAppearanceAnchor | null>(null);
  const pendingEpubReflowRef = useRef<EpubReflowRequest | null>(null);
  const activeEpubReflowRef = useRef<EpubReflowRequest | null>(null);
  const epubFrameSizeRef = useRef<EpubFrameSize | null>(null);
  const epubLanguageRef = useRef<string | null>(null);
  const epubReadyRef = useRef(false);
  const pendingTextAppearanceAnchorRef = useRef<TextAppearanceAnchor | null>(null);
  const cloudProgressTimerRef = useRef<number | null>(null);
  const pendingCloudProgressRef = useRef<ReturnType<typeof saveReadingPosition> | null>(null);
  const pencilModeRef = useRef(loadReaderSettings().pencilMode);
  const gestureRef = useRef<GestureState | null>(null);
  const stageGestureRef = useRef<StageGesture | null>(null);
  const desktopReaderRef = useRef(false);
  const pageFallbackTimerRef = useRef<number | null>(null);
  const selectionTimerRef = useRef<number | null>(null);
  const hlsInstancesRef = useRef<Set<{ destroy: () => void }>>(new Set());
  const epubMediaCleanupRef = useRef<Set<() => void>>(new Set());
  const imageDialogRef = useRef<HTMLDialogElement>(null);
  const imageReturnFocusRef = useRef<HTMLElement | null>(null);
  const embedDialogRef = useRef<HTMLDialogElement>(null);
  const embedReturnFocusRef = useRef<HTMLElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const tocPanelRef = useRef<HTMLElement>(null);
  const settingsRef = useRef<ReaderSettings>(loadReaderSettings());
  const selectedKeyRef = useRef("");
  const selectionInputRef = useRef<ReaderInputKind>("mouse");
  const [displayTitle, setDisplayTitle] = useState(source.title);
  const [selected, setSelected] = useState("");
  const [selectionAnchor, setSelectionAnchor] = useState<SelectionAnchor | null>(null);
  const [rewrite, setRewrite] = useState("");
  const [rewriteState, setRewriteState] = useState<RewriteState>("idle");
  const [assistanceMode, setAssistanceMode] = useState<AssistanceMode>("english");
  const [chatDraft, setChatDraft] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatState, setChatState] = useState<ChatState>("idle");
  const [chatError, setChatError] = useState("");
  const [chatSources, setChatSources] = useState<ChatSource[]>([]);
  const [searchAvailable, setSearchAvailable] = useState(false);
  const [pageProgress, setPageProgress] = useState(0);
  const [pageNumber, setPageNumber] = useState<EpubPageNumber | null>(null);
  const [locationsReady, setLocationsReady] = useState(false);
  const [settings, setSettings] = useState<ReaderSettings>(loadReaderSettings);
  settingsRef.current = settings;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [tocLoaded, setTocLoaded] = useState(false);
  const [tocItems, setTocItems] = useState<EpubTocItem[]>([]);
  const [currentHref, setCurrentHref] = useState("");
  const [desktopReader, setDesktopReader] = useState(false);
  const [imageView, setImageView] = useState<EpubImageView | null>(null);
  const [imageZoomed, setImageZoomed] = useState(false);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [embedView, setEmbedView] = useState<EpubEmbedView | null>(null);
  const textParagraphs = source.type === "text" ? source.text.split(/\n\s*\n/).filter(Boolean) : [];

  useEffect(() => {
    if (source.assistantMode !== "ask") return;
    let cancelled = false;
    void fetch("/api/health").then(async (response) => {
      if (!response.ok) return;
      const health = await response.json() as { searchConfigured?: boolean };
      if (!cancelled) setSearchAvailable(Boolean(health.searchConfigured));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [source.assistantMode]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [chatMessages, chatState]);

  useEffect(() => {
    const dialog = imageDialogRef.current;
    if (imageView && dialog && !dialog.open) dialog.showModal();
    if (!imageView) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeImageView();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [imageView]);

  useEffect(() => {
    const dialog = embedDialogRef.current;
    if (embedView && dialog && !dialog.open) dialog.showModal();
    if (!embedView) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeEmbedView();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [embedView]);

  function captureEpubAppearanceAnchor() {
    const rendition = renditionRef.current;
    const frame = epubRef.current?.getBoundingClientRect();
    if (!rendition || !frame) return null;

    for (const contents of rendition.getContents?.() ?? []) {
      const document = contents?.document as Document | undefined;
      const iframe = document?.defaultView?.frameElement as HTMLElement | null;
      if (!document || !iframe) continue;
      const iframeRect = iframe.getBoundingClientRect();
      const left = Math.max(frame.left, iframeRect.left);
      const top = Math.max(frame.top, iframeRect.top);
      const right = Math.min(frame.right, iframeRect.right);
      const bottom = Math.min(frame.bottom, iframeRect.bottom);
      if (right <= left || bottom <= top) continue;

      for (const point of visualAnchorPoints({ left, top, width: right - left, height: bottom - top })) {
        const caret = caretPointFromCoordinates(document, point.x - iframeRect.left, point.y - iframeRect.top);
        if (!caret || !closestTextBlock(caret.node)?.textContent?.trim()) continue;
        const range = caretRange(document, caret);
        if (!range) continue;
        try {
          const cfi = contents.cfiFromRange(range);
          if (cfi) return cfi as string;
        } catch {
          // Try another visible text point before falling back to the page CFI.
        }
      }
    }
    return rendition.currentLocation?.()?.start?.cfi ?? null;
  }

  function captureTextAppearanceAnchor() {
    const stage = readingStageRef.current;
    if (!stage) return null;
    const rect = stage.getBoundingClientRect();
    for (const point of visualAnchorPoints(rect)) {
      const caret = caretPointFromCoordinates(document, point.x, point.y);
      const paragraph = closestTextBlock(caret?.node ?? null)?.closest<HTMLElement>(".reader-paragraph");
      if (caret && paragraph) {
        const range = caretRange(document, caret);
        const viewportTop = range?.getBoundingClientRect().top;
        if (viewportTop !== undefined) return { target: caret.node, offset: caret.offset, viewportTop };
      }
      if (paragraph) return { target: paragraph, viewportTop: paragraph.getBoundingClientRect().top };
    }
    const paragraph = Array.from(stage.querySelectorAll<HTMLElement>(".reader-paragraph"))
      .find((element) => element.getBoundingClientRect().bottom > rect.top);
    return paragraph ? { target: paragraph, viewportTop: paragraph.getBoundingClientRect().top } : null;
  }

  function clearSettledAppearanceAnchor(request: EpubReflowRequest) {
    const pendingAppearance = pendingEpubAppearanceAnchorRef.current;
    if (
      request.appearance
      && pendingAppearance
      && pendingAppearance.revision <= request.appearanceRevision
      && !pendingEpubReflowRef.current
    ) {
      pendingEpubAppearanceAnchorRef.current = null;
    }
  }

  function finishEpubReflow() {
    const completed = activeEpubReflowRef.current;
    if (!completed) return;
    activeEpubReflowRef.current = null;
    const frame = epubRef.current?.getBoundingClientRect();
    if (frame) epubFrameSizeRef.current = epubFrameSize(frame);
    if (pendingEpubReflowRef.current) {
      if (reflowTimerRef.current) window.clearTimeout(reflowTimerRef.current);
      reflowTimerRef.current = window.setTimeout(flushEpubReflow, 0);
      return;
    }
    clearSettledAppearanceAnchor(completed);
  }

  function flushEpubReflow() {
    reflowTimerRef.current = null;
    if (activeEpubReflowRef.current || !epubReadyRef.current) return;
    const rendition = renditionRef.current;
    const frame = epubRef.current?.getBoundingClientRect();
    const request = pendingEpubReflowRef.current;
    const nextSize = frame ? epubFrameSize(frame) : null;
    if (!rendition || !request || !nextSize) return;

    const action = epubReflowAction(request, epubFrameSizeRef.current, nextSize);
    pendingEpubReflowRef.current = null;
    if (action === "none") {
      epubFrameSizeRef.current = nextSize;
      clearSettledAppearanceAnchor(request);
      return;
    }

    activeEpubReflowRef.current = request;
    try {
      if (action === "resize") {
        epubFrameSizeRef.current = nextSize;
        rendition.resize?.(nextSize.width, nextSize.height, request.anchor ?? undefined);
      } else {
        rendition.clear?.();
        Promise.resolve(rendition.display?.(request.anchor ?? undefined)).catch(finishEpubReflow);
      }
    } catch {
      finishEpubReflow();
    }
  }

  function requestEpubReflow(reason: "frame" | "appearance" | "content", delay = 120) {
    if (!epubReadyRef.current || !renditionRef.current) return;
    const appearanceAnchor = pendingEpubAppearanceAnchorRef.current;
    const queuedAnchor = pendingEpubReflowRef.current?.anchor
      ?? activeEpubReflowRef.current?.anchor;
    const anchor = appearanceAnchor?.cfi
      ?? queuedAnchor
      ?? captureEpubAppearanceAnchor()
      ?? renditionRef.current.currentLocation?.()?.start?.cfi
      ?? null;
    pendingEpubReflowRef.current = mergeEpubReflowRequest(
      pendingEpubReflowRef.current,
      {
        anchor,
        appearance: reason === "appearance" || Boolean(appearanceAnchor),
        content: reason === "content",
        appearanceRevision: appearanceAnchor?.revision ?? 0,
        contentRevision: reason === "content" ? ++epubContentRevisionRef.current : 0,
        revision: ++epubReflowRevisionRef.current,
      },
    );
    if (reflowTimerRef.current) window.clearTimeout(reflowTimerRef.current);
    reflowTimerRef.current = window.setTimeout(flushEpubReflow, delay);
  }

  function preserveAppearanceAnchor() {
    if (source.type === "epub") {
      const cfi = pendingEpubAppearanceAnchorRef.current?.cfi ?? captureEpubAppearanceAnchor();
      if (!cfi) return;
      pendingEpubAppearanceAnchorRef.current = {
        cfi,
        revision: ++appearanceRevisionRef.current,
      };
      return;
    }
    pendingTextAppearanceAnchorRef.current ??= captureTextAppearanceAnchor();
  }

  function updateSettings(patch: Partial<ReaderSettings>) {
    if (
      patch.fontSize
      || patch.lineHeight
      || patch.pageWidth
      || patch.theme
      || patch.textAlign
      || patch.paragraphStyle
      || patch.typographyMode
    ) preserveAppearanceAnchor();
    setSettings((current) => {
      const next = { ...current, ...patch };
      pencilModeRef.current = next.pencilMode;
      if (patch.pencilMode) applyPencilModeToOpenContents(patch.pencilMode);
      saveReaderSettings(next);
      void saveCloudState({ settings: next }).catch(() => undefined);
      return next;
    });
  }

  function applyPencilModeToContents(contents: any, mode: PencilMode) {
    const effectiveMode = desktopReaderRef.current ? "select" : mode;
    const root = contents?.document?.documentElement as HTMLElement | undefined;
    const body = contents?.document?.body as HTMLElement | undefined;
    for (const element of [root, body]) {
      element?.style.setProperty("touch-action", "pan-y pinch-zoom", "important");
      element?.style.setProperty("overscroll-behavior", "none", "important");
      element?.style.setProperty("user-select", effectiveMode === "page" ? "none" : "text", "important");
      element?.style.setProperty("-webkit-user-select", effectiveMode === "page" ? "none" : "text", "important");
      element?.setAttribute("data-dawn-input-mode", desktopReaderRef.current ? "desktop" : effectiveMode);
    }
  }

  function applyPencilModeToOpenContents(mode: PencilMode) {
    const contents = renditionRef.current?.getContents?.() ?? [];
    for (const content of contents) applyPencilModeToContents(content, mode);
  }

  function applyTypographyToContents(document: Document, next = settingsRef.current) {
    return applyEpubTypographyDocument(document, {
      publicationLanguage: epubLanguageRef.current,
      textAlign: next.textAlign,
      paragraphStyle: next.paragraphStyle,
      typographyMode: next.typographyMode,
    });
  }

  function applyTypographyToOpenContents(next = settingsRef.current) {
    for (const contents of renditionRef.current?.getContents?.() ?? []) {
      const document = contents?.document as Document | undefined;
      if (document) applyTypographyToContents(document, next);
    }
  }

  function setPencilMode(mode: PencilMode) {
    updateSettings({ pencilMode: mode });
    clearSelection();
  }

  function persistProgress(progressKey: string, cfi: string, percentage: number) {
    const position = saveReadingPosition(progressKey, { cfi, percentage });
    if (source.type !== "epub" || !source.id) return;
    pendingCloudProgressRef.current = position;
    if (cloudProgressTimerRef.current) window.clearTimeout(cloudProgressTimerRef.current);
    cloudProgressTimerRef.current = window.setTimeout(() => {
      pendingCloudProgressRef.current = null;
      void saveCloudProgress(source.id!, position).catch(() => undefined);
    }, 800);
  }

  function applyEpubTheme(rendition: any, next = settings) {
    const colors = themeColors[next.theme];
    rendition?.themes?.default({
      html: { background: `${colors.background} !important` },
      body: {
        color: `${colors.color} !important`,
        background: `${colors.background} !important`,
        padding: "24px 34px !important",
      },
      "p, li, blockquote": {
        "font-size": "inherit !important",
        "line-height": "inherit !important",
      },
      a: { color: next.theme === "night" ? "#efa06a !important" : "#a65332 !important" },
      "[data-dawn-media-card][data-dawn-keep-together='true']": {
        "break-inside": "avoid !important",
        "page-break-inside": "avoid !important",
      },
      "figure": {
        width: "100% !important",
        margin: "1.7em auto !important",
        padding: "0 !important",
      },
      "figure img[data-dawn-media], img[data-dawn-media]": {
        display: "block !important",
        width: "auto !important",
        height: "auto !important",
        "max-width": "100% !important",
        "max-height": "min(72vh, 760px) !important",
        margin: "0 auto !important",
        "object-fit": "contain !important",
        "break-inside": "avoid !important",
        "page-break-inside": "avoid !important",
      },
      "[data-dawn-media-root='image']": {
        position: "relative !important",
      },
      "img[data-dawn-inspectable]": {
        cursor: "zoom-in !important",
        "border-radius": "4px !important",
      },
      "button[data-dawn-image-action]": {
        position: "absolute !important",
        top: "8px !important",
        right: "8px !important",
        "min-width": "44px !important",
        "min-height": "44px !important",
        padding: "0 11px !important",
        border: `1px solid ${next.theme === "night" ? "#59666a" : "#a9b1ae"} !important`,
        "border-radius": "6px !important",
        color: `${next.theme === "night" ? "#eee9df" : "#334044"} !important`,
        background: `${next.theme === "night" ? "rgba(28,34,34,.92)" : "rgba(250,249,244,.93)"} !important`,
        "box-shadow": "0 3px 12px rgba(20,28,30,.16) !important",
        "font-family": "-apple-system, BlinkMacSystemFont, sans-serif !important",
        "font-size": ".65em !important",
        "touch-action": "manipulation !important",
      },
      "button[data-dawn-image-action]:focus-visible": {
        outline: `3px solid ${next.theme === "night" ? "#efa06a" : "#a65332"} !important`,
        "outline-offset": "2px !important",
      },
      "figcaption": {
        "max-width": "66ch !important",
        margin: ".72em auto 0 !important",
        color: `${next.theme === "night" ? "#929c9b" : "#66716f"} !important`,
        "font-family": "-apple-system, BlinkMacSystemFont, sans-serif !important",
        "font-size": ".72em !important",
        "line-height": "1.55 !important",
      },
      "video[data-dawn-media]": {
        display: "block !important",
        width: "100% !important",
        height: "auto !important",
        "max-width": "100% !important",
        "max-height": "min(52vh, 480px) !important",
        border: "0 !important",
        "border-radius": "6px !important",
        background: "#101413 !important",
        "touch-action": "manipulation !important",
      },
      "iframe[data-dawn-media]": {
        display: "block !important",
        width: "100% !important",
        height: "auto !important",
        "min-height": "240px !important",
        "max-width": "100% !important",
        "max-height": "min(64vh, 560px) !important",
        border: `1px solid ${next.theme === "night" ? "#354148" : "#c9cfcc"} !important`,
        "border-radius": "6px !important",
        background: "#101413 !important",
        "touch-action": "manipulation !important",
      },
      "iframe[data-dawn-media][hidden]": {
        display: "none !important",
      },
      "audio[data-dawn-media]": {
        display: "block !important",
        width: "100% !important",
        "touch-action": "manipulation !important",
      },
      "[data-dawn-media-state='unavailable']": {
        opacity: ".58 !important",
        filter: "grayscale(.35) !important",
      },
      "[data-dawn-media-fallback]": {
        display: "block !important",
        width: "fit-content !important",
        margin: ".65em auto 1.4em !important",
        "font-family": "-apple-system, BlinkMacSystemFont, sans-serif !important",
        "font-size": ".68em !important",
        "line-height": "1.4 !important",
        "text-underline-offset": ".22em !important",
      },
      "[data-dawn-embed-action]": {
        width: "100% !important",
        "min-height": "86px !important",
        margin: "1.3em 0 .4em !important",
        border: `1px solid ${next.theme === "night" ? "#52636b" : "#aeb8b6"} !important`,
        "border-radius": "7px !important",
        color: `${next.theme === "night" ? "#e2ded5" : "#374348"} !important`,
        background: `${next.theme === "night" ? "#202a2e" : "#eef0eb"} !important`,
        "font-family": "-apple-system, BlinkMacSystemFont, sans-serif !important",
        "font-size": ".76em !important",
        "touch-action": "manipulation !important",
      },
    });
    rendition?.themes?.override("font-size", `${next.fontSize}px`, true);
    rendition?.themes?.override("line-height", String(next.lineHeight), true);
  }

  async function requestRewrite(text: string, context: RewriteContext, mode: AssistanceMode = "english") {
    rewriteAbortRef.current?.abort();
    const controller = new AbortController();
    rewriteAbortRef.current = controller;
    setRewrite("");
    setRewriteState("loading");
    try {
      const response = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.slice(0, 1200),
          context,
          bookTitle: displayTitle,
          preset: profile.preset,
          mode,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error ?? "Rewrite failed");
      }
      const data = await response.json() as { rewrite?: string };
      if (!data.rewrite?.trim()) throw new Error("The provider returned no rewrite.");
      setRewrite(data.rewrite.trim());
      setRewriteState("complete");
    } catch (error) {
      if (controller.signal.aborted) return;
      setRewrite(error instanceof Error ? error.message : "Rewrite failed");
      setRewriteState("error");
    }
  }

  function beginSelection(text: string, anchor: SelectionAnchor, context: RewriteContext) {
    selectedContextRef.current = context;
    setSelected(text);
    setSelectionAnchor(anchor);
    setAssistanceMode("english");
    setChatDraft("");
    setChatMessages([]);
    setChatState("idle");
    setChatError("");
    setChatSources([]);
    if (source.assistantMode === "rewrite") void requestRewrite(text, context, "english");
  }

  function requestChineseDetail() {
    const context = selectedContextRef.current;
    if (!selected || !context) return;
    setAssistanceMode("chinese");
    void requestRewrite(selected, context, "chinese");
  }

  function retryAssistance() {
    const context = selectedContextRef.current;
    if (!selected || !context) return;
    void requestRewrite(selected, context, assistanceMode);
  }

  async function sendQuestion(question: string, history = chatMessages) {
    const context = selectedContextRef.current;
    const trimmed = question.trim();
    if (!selected || !context || !trimmed || chatState === "loading") return;
    const outgoing = [...history, { role: "user" as const, content: trimmed }];
    setChatMessages(outgoing);
    setChatDraft("");
    setChatState("loading");
    setChatError("");
    setChatSources([]);
    rewriteAbortRef.current?.abort();
    const controller = new AbortController();
    rewriteAbortRef.current = controller;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: selected.slice(0, 2400),
          context,
          bookTitle: displayTitle,
          messages: outgoing,
        }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null) as {
        answer?: string;
        error?: string;
        sources?: ChatSource[];
        searchAvailable?: boolean;
      } | null;
      if (!response.ok || !data?.answer?.trim()) throw new Error(data?.error ?? "没有收到回答。");
      setChatMessages([...outgoing, { role: "assistant", content: data.answer.trim() }]);
      setChatSources(data.sources ?? []);
      setSearchAvailable(Boolean(data.searchAvailable));
      setChatState("idle");
    } catch (error) {
      if (controller.signal.aborted) return;
      setChatError(error instanceof Error ? error.message : "对话失败，请稍后重试。");
      setChatState("error");
    }
  }

  function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendQuestion(chatDraft);
  }

  function captureEpubSelection(contents: any, suppliedCfi?: string) {
    const selection = contents?.window?.getSelection?.() as Selection | null;
    const input = selectionInputRef.current;
    const acceptsSelection = input === "mouse" || (input === "pen" && pencilModeRef.current === "select");
    if (!acceptsSelection) {
      selection?.removeAllRanges();
      return;
    }
    const text = selection?.toString().trim() ?? "";
    if (!text || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    let cfiRange = suppliedCfi ?? "";
    if (!cfiRange) {
      try { cfiRange = contents.cfiFromRange(range); } catch { /* native selection remains available */ }
    }
    const selectionKey = `${cfiRange}:${text}`;
    if (selectedKeyRef.current === selectionKey) return;
    selectedKeyRef.current = selectionKey;
    if (selectedCfiRef.current) {
      try { renditionRef.current?.annotations.remove(selectedCfiRef.current, "highlight"); } catch { /* no-op */ }
    }
    selectedCfiRef.current = cfiRange || null;
    selectedContentsRef.current = contents;
    if (cfiRange) {
      try {
        renditionRef.current?.annotations.highlight(cfiRange, {}, undefined, "dawn-selection", {
          fill: "#e78349",
          "fill-opacity": "0.24",
          "mix-blend-mode": "multiply",
        });
      } catch { /* browser selection remains as fallback */ }
    }
    const rect = range.getBoundingClientRect();
    const iframe = contents.document.defaultView?.frameElement as HTMLElement | null;
    const frameRect = iframe?.getBoundingClientRect();
    const top = (frameRect?.top ?? 0) + rect.top;
    const bottom = (frameRect?.top ?? 0) + rect.bottom;
    const placement = top > 230 ? "above" : "below";
    beginSelection(text, {
      x: Math.min(window.innerWidth - 190, Math.max(190, (frameRect?.left ?? 0) + rect.left + rect.width / 2)),
      y: placement === "above" ? top : bottom,
      placement,
    }, contextFromDomSelection(selection));
  }

  function scheduleEpubSelection(contents: any, delay = 320) {
    if (selectionTimerRef.current) window.clearTimeout(selectionTimerRef.current);
    selectionTimerRef.current = window.setTimeout(() => {
      const selection = contents?.window?.getSelection?.() as Selection | null;
      if (!selection?.rangeCount || selection.isCollapsed || !selection.toString().trim()) {
        if (selectedContentsRef.current === contents && selectedKeyRef.current) clearSelection();
        return;
      }
      captureEpubSelection(contents);
    }, delay);
  }

  function epubScrollLeft() {
    return epubRef.current?.querySelector<HTMLElement>(".epub-container")?.scrollLeft ?? 0;
  }

  function updatePageNumber(cfi: string | null | undefined) {
    const book = bookRef.current;
    if (!book || !cfi) return;
    const pageListPage = book.pageList?.pageFromCfi?.(cfi) ?? -1;
    const fromPublisher = publisherPageNumber(pageListPage, book.pageList?.lastPage ?? -1);
    if (fromPublisher) {
      setPageNumber(fromPublisher);
      return;
    }
    setPageNumber(pageNumberFromLocation(
      book.locations?.locationFromCfi?.(cfi) ?? -1,
      book.locations?.total ?? -1,
    ));
  }

  function startGesture(kind: ReaderInputKind, x: number, y: number, pointerId?: number, touchSeen = false, startedOnBlank = false, interactive = false) {
    gestureRef.current = {
      kind,
      mode: pencilModeRef.current,
      startX: x,
      startY: y,
      lastX: x,
      lastY: y,
      startScrollLeft: epubScrollLeft(),
      touchSeen,
      completed: false,
      startedOnBlank,
      interactive,
      pointerId,
    };
    if (!(kind === "pen" && pencilModeRef.current === "select")) clearSelection();
  }

  function completeGesture(contents: any, x: number, y: number) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.completed) return;
    gesture.completed = true;
    gesture.lastX = x;
    gesture.lastY = y;
    gestureRef.current = null;

    if (gesture.interactive) return;

    if (gesture.kind === "mouse" && desktopReaderRef.current) {
      const selection = contents.document.getSelection() as Selection | null;
      const hasSelection = Boolean(selection?.rangeCount && !selection.isCollapsed && selection.toString().trim());
      const bookRect = epubRef.current?.getBoundingClientRect();
      const frame = contents.document.defaultView?.frameElement as HTMLElement | null;
      const frameRect = frame?.getBoundingClientRect();
      const frameOffsetX = (frameRect?.left ?? bookRect?.left ?? 0) - (bookRect?.left ?? 0);
      const direction = desktopPageTurnFromPointer({
        startX: gesture.startX + frameOffsetX,
        startY: gesture.startY,
        endX: x + frameOffsetX,
        endY: y,
        width: Math.max(1, bookRect?.width ?? contents.document.documentElement.clientWidth),
        startedOnBlank: gesture.startedOnBlank,
        hasSelection,
      });
      if (direction) {
        if (pageFallbackTimerRef.current) window.clearTimeout(pageFallbackTimerRef.current);
        pageFallbackTimerRef.current = window.setTimeout(() => {
          const epubHandledGesture = Math.abs(epubScrollLeft() - gesture.startScrollLeft) > 8;
          if (!epubHandledGesture) turnPage(direction);
        }, 160);
        return;
      }
      scheduleEpubSelection(contents, 140);
      return;
    }

    if (gesture.kind === "pen" && gesture.mode === "select") {
      const selection = contents.document.getSelection() as Selection | null;
      if (!selection?.rangeCount || selection.isCollapsed || !selection.toString().trim()) {
        const start = caretPointFromCoordinates(contents.document, gesture.startX, gesture.startY);
        const end = caretPointFromCoordinates(contents.document, x, y);
        if (start && end) selectBetween(contents.document, start, end);
      }
      scheduleEpubSelection(contents, 140);
      return;
    }

    if (shouldTurnPage(gesture.kind, gesture.mode)) {
      const pageWidth = Math.max(1, epubRef.current?.clientWidth ?? window.innerWidth);
      const direction = pageTurnFromPointer(gesture.startX, gesture.startY, x, y, pageWidth);
      if (!direction) return;
      if (pageFallbackTimerRef.current) window.clearTimeout(pageFallbackTimerRef.current);
      pageFallbackTimerRef.current = window.setTimeout(() => {
        const epubHandledGesture = Math.abs(epubScrollLeft() - gesture.startScrollLeft) > 8;
        if (!epubHandledGesture) turnPage(direction);
      }, 160);
      return;
    }

    scheduleEpubSelection(contents, 140);
  }

  function handlePageKey(event: KeyboardEvent) {
    if (
      source.type !== "epub"
      || event.defaultPrevented
      || event.altKey
      || event.ctrlKey
      || event.metaKey
      || event.shiftKey
      || isPageTurnControlTarget(event.target)
    ) return;
    const direction = pageTurnFromKey(event.key);
    if (!direction) return;
    event.preventDefault();
    turnPage(direction);
  }

  useEffect(() => {
    document.documentElement.classList.add("reader-active");
    document.body.classList.add("reader-active");
    return () => {
      document.documentElement.classList.remove("reader-active");
      document.body.classList.remove("reader-active");
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(hover: hover) and (pointer: fine)");
    const updateInputEnvironment = () => {
      const desktop = isDesktopReaderEnvironment();
      desktopReaderRef.current = desktop;
      setDesktopReader(desktop);
      applyPencilModeToOpenContents(settings.pencilMode);
    };
    updateInputEnvironment();
    media.addEventListener("change", updateInputEnvironment);
    return () => media.removeEventListener("change", updateInputEnvironment);
    // settings changes already reapply the current input mode
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (source.type !== "epub") return;
    const onKeyDown = (event: KeyboardEvent) => handlePageKey(event);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // key handling reads the current rendition through refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearSelection();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected]);

  useEffect(() => {
    if (!tocOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTocOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => {
      tocPanelRef.current?.querySelector<HTMLElement>("[data-current='true']")?.scrollIntoView({ block: "center" });
    });
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tocOpen]);

  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    applyEpubTheme(rendition);
    applyTypographyToOpenContents();
    rendition.spread?.("auto", 900);
    requestEpubReflow("appearance", 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.fontSize,
    settings.lineHeight,
    settings.pageWidth,
    settings.theme,
    settings.textAlign,
    settings.paragraphStyle,
    settings.typographyMode,
  ]);

  useLayoutEffect(() => {
    if (source.type !== "text") return;
    const anchor = pendingTextAppearanceAnchorRef.current;
    const stage = readingStageRef.current;
    if (!anchor || !stage) return;
    const nextViewportTop = viewportTopForTextAnchor(anchor);
    if (nextViewportTop !== null) {
      stage.scrollTop = restoredScrollTop(
        stage.scrollTop,
        anchor.viewportTop,
        nextViewportTop,
        stage.scrollHeight - stage.clientHeight,
      );
    }
    pendingTextAppearanceAnchorRef.current = null;
  }, [
    settings.fontSize,
    settings.lineHeight,
    settings.pageWidth,
    settings.theme,
    settings.textAlign,
    settings.paragraphStyle,
    settings.typographyMode,
    source.type,
  ]);

  useEffect(() => {
    if (source.type !== "epub" || !epubRef.current) return;
    setLocationsReady(false);
    setPageNumber(null);
    setTocLoaded(false);
    setTocItems([]);
    setCurrentHref("");
    let cancelled = false;
    let book: any;
    let frameResizeObserver: ResizeObserver | null = null;
    const progressKey = `dawn-reader-progress:${source.id ?? source.file.name}`;
    let canPersistProgress = false;
    let locationsGenerated = false;
    source.file.arrayBuffer().then(async (buffer) => {
      if (cancelled || !epubRef.current) return;
      const localPosition = parseReadingPosition(localStorage.getItem(progressKey));
      const savedPosition = localPosition;
      if (cancelled || !epubRef.current) return;
      const { default: ePub } = await import("epubjs");
      book = ePub(buffer);
      bookRef.current = book;
      const metadata = await book.loaded.metadata.catch(() => null) as {
        title?: string;
        language?: unknown;
      } | null;
      if (cancelled || !epubRef.current) return;
      if (metadata?.title) setDisplayTitle(metadata.title.trim());
      epubLanguageRef.current = normalizePublicationLanguage(metadata?.language);
      book.loaded.navigation.then((navigation: { toc?: unknown }) => {
        if (!cancelled) {
          setTocItems(normalizeEpubToc(navigation.toc));
          setTocLoaded(true);
        }
      }).catch(() => {
        if (!cancelled) setTocLoaded(true);
      });
      const initialFrame = epubRef.current.getBoundingClientRect();
      const rendition = book.renderTo(epubRef.current, {
        width: Math.max(1, Math.floor(initialFrame.width)),
        height: Math.max(1, Math.floor(initialFrame.height)),
        manager: "continuous",
        flow: "paginated",
        snap: true,
        spread: "auto",
        minSpreadWidth: 900,
        resizeOnOrientationChange: false,
      });
      renditionRef.current = rendition;
      epubReadyRef.current = false;
      epubFrameSizeRef.current = epubFrameSize(initialFrame);
      pendingEpubReflowRef.current = null;
      activeEpubReflowRef.current = null;
      epubContentLayoutSignaturesRef.current.clear();
      applyEpubTheme(rendition);
      rendition.hooks.content.register((contents: any) => {
        const document = contents.document as Document;
        applyPencilModeToContents(contents, pencilModeRef.current);
        applyTypographyToContents(document);
        const preparedMedia = prepareEpubMediaDocument(document, {
          onImageActivate: (target) => {
            imageReturnFocusRef.current = target.element;
            setImageZoomed(false);
            setImageLoadFailed(false);
            setImageView({
              source: target.source,
              label: target.label,
              caption: target.caption,
              sourceHref: target.sourceHref,
            });
          },
          onEmbedActivate: (target) => {
            embedReturnFocusRef.current = target.element;
            setEmbedView({ source: target.source, title: target.title });
          },
          onIntrinsicSizeChange: (element) => {
            const media = element as HTMLMediaElement & HTMLImageElement & HTMLVideoElement;
            const source = media.currentSrc || media.getAttribute("src") || media.dataset.dawnStream || "inline";
            const width = media.naturalWidth || media.videoWidth || element.clientWidth;
            const height = media.naturalHeight || media.videoHeight || element.clientHeight;
            const signature = `${document.baseURI}|${element.tagName}|${source}|${element.dataset.dawnMediaState ?? "ready"}|${width}x${height}`;
            if (epubContentLayoutSignaturesRef.current.has(signature)) return;
            epubContentLayoutSignaturesRef.current.add(signature);
            requestEpubReflow("content", 180);
          },
        });
        const documentHls = new Set<{ destroy: () => void }>();
        const documentMediaListeners: Array<() => void> = [];
        const contentWindow = document.defaultView;
        const cleanupDocumentMedia = () => {
          preparedMedia.cleanup();
          for (const cleanup of documentMediaListeners.splice(0)) cleanup();
          for (const hls of documentHls) {
            hls.destroy();
            hlsInstancesRef.current.delete(hls);
          }
          documentHls.clear();
          contentWindow?.removeEventListener("pagehide", cleanupDocumentMedia);
          epubMediaCleanupRef.current.delete(cleanupDocumentMedia);
        };
        contentWindow?.addEventListener("pagehide", cleanupDocumentMedia, { once: true });
        epubMediaCleanupRef.current.add(cleanupDocumentMedia);
        for (const target of preparedMedia.hlsTargets) {
          target.element.dataset.dawnMediaState = "idle";
          const attach = () => {
            const state = target.element.dataset.dawnMediaState;
            if (cancelled || !target.element.isConnected || state === "attaching" || state === "ready") return;
            target.element.dataset.dawnMediaState = "attaching";
            void import("hls.js").then(({ default: Hls }) => {
              if (cancelled || !target.element.isConnected || !Hls.isSupported()) {
                target.element.dataset.dawnMediaState = "unavailable";
                return;
              }
              let networkRecoveries = 0;
              let mediaRecoveries = 0;
              const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
              hlsInstancesRef.current.add(hls);
              documentHls.add(hls);
              hls.on(Hls.Events.MANIFEST_PARSED, () => {
                target.element.dataset.dawnMediaState = "ready";
              });
              hls.on(Hls.Events.ERROR, (_event, data) => {
                if (!data.fatal) return;
                if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRecoveries < 1) {
                  networkRecoveries += 1;
                  target.element.dataset.dawnMediaState = "retrying";
                  hls.startLoad();
                  return;
                }
                if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 1) {
                  mediaRecoveries += 1;
                  target.element.dataset.dawnMediaState = "retrying";
                  hls.recoverMediaError();
                  return;
                }
                target.element.dataset.dawnMediaState = "unavailable";
                hls.destroy();
                documentHls.delete(hls);
                hlsInstancesRef.current.delete(hls);
              });
              hls.loadSource(target.source);
              hls.attachMedia(target.element);
            }).catch(() => {
              target.element.dataset.dawnMediaState = "unavailable";
            });
          };
          const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Enter" || event.key === " ") attach();
          };
          target.element.addEventListener("pointerdown", attach);
          target.element.addEventListener("keydown", onKeyDown);
          documentMediaListeners.push(() => {
            target.element.removeEventListener("pointerdown", attach);
            target.element.removeEventListener("keydown", onKeyDown);
          });
        }

        const onPointerDown = (event: PointerEvent) => {
          const kind = pointerInputKind(event.pointerType);
          selectionInputRef.current = kind;
          if (gestureRef.current && gestureRef.current.pointerId === undefined) {
            gestureRef.current.pointerId = event.pointerId;
            if (kind === "pen") gestureRef.current.kind = "pen";
            return;
          }
          startGesture(
            kind,
            event.clientX,
            event.clientY,
            event.pointerId,
            false,
            kind === "mouse" && !pointHitsReadableContent(document, event.clientX, event.clientY),
            isPageTurnControlTarget(event.target) || isEpubMediaControlTarget(event.target),
          );
        };
        const onPointerMove = (event: PointerEvent) => {
          const gesture = gestureRef.current;
          if (!gesture || gesture.pointerId !== event.pointerId) return;
          gesture.lastX = event.clientX;
          gesture.lastY = event.clientY;
        };
        const onPointerUp = (event: PointerEvent) => {
          const gesture = gestureRef.current;
          if (!gesture || gesture.pointerId !== event.pointerId) return;
          completeGesture(contents, event.clientX, event.clientY);
        };
        const onPointerCancel = (event: PointerEvent) => {
          const gesture = gestureRef.current;
          if (!gesture || gesture.pointerId !== event.pointerId) return;
          if (gesture.touchSeen) {
            gesture.pointerId = undefined;
          } else {
            gestureRef.current = null;
            scheduleEpubSelection(contents, 180);
          }
        };
        const onTouchStart = (event: TouchEvent) => {
          const touch = event.changedTouches[0];
          if (!touch) return;
          const reportedKind = touchInputKind((touch as Touch & { touchType?: string }).touchType);
          const kind = gestureRef.current?.kind === "pen" ? "pen" : reportedKind;
          selectionInputRef.current = kind;
          if (gestureRef.current) {
            gestureRef.current.touchSeen = true;
            gestureRef.current.kind = kind;
          } else {
            startGesture(
              kind,
              touch.clientX,
              touch.clientY,
              undefined,
              true,
              false,
              isPageTurnControlTarget(event.target) || isEpubMediaControlTarget(event.target),
            );
          }
          if (kind === "pen" && pencilModeRef.current === "select") event.stopPropagation();
        };
        const onTouchMove = (event: TouchEvent) => {
          const gesture = gestureRef.current;
          const touch = event.changedTouches[0];
          if (!gesture || !touch) return;
          gesture.lastX = touch.clientX;
          gesture.lastY = touch.clientY;
          if (gesture.kind === "pen" && gesture.mode === "select") event.stopPropagation();
        };
        const onTouchEnd = (event: TouchEvent) => {
          const gesture = gestureRef.current;
          const touch = event.changedTouches[0];
          if (!gesture || !touch) return;
          if (gesture.kind === "pen" && gesture.mode === "select") event.stopPropagation();
          completeGesture(contents, touch.clientX, touch.clientY);
        };
        const onSelectionChange = () => {
          scheduleEpubSelection(contents);
        };
        const onKeyDown = (event: KeyboardEvent) => handlePageKey(event);

        document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: false });
        document.addEventListener("pointermove", onPointerMove, { capture: true, passive: false });
        document.addEventListener("pointerup", onPointerUp, { capture: true, passive: false });
        document.addEventListener("pointercancel", onPointerCancel, { capture: true, passive: false });
        document.addEventListener("touchstart", onTouchStart, { capture: true, passive: false });
        document.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
        document.addEventListener("touchend", onTouchEnd, { capture: true, passive: false });
        document.addEventListener("touchcancel", () => { gestureRef.current = null; }, { capture: true, passive: false });
        document.addEventListener("selectionchange", onSelectionChange, { passive: true });
        document.addEventListener("keydown", onKeyDown);
      });
      rendition.on("selected", (cfiRange: string, contents: any) => {
        captureEpubSelection(contents, cfiRange);
      });
      frameResizeObserver = new ResizeObserver(([entry]) => {
        if (!epubReadyRef.current || !epubFrameSize(entry.contentRect)) return;
        requestEpubReflow("frame", 120);
      });
      frameResizeObserver.observe(epubRef.current);
      rendition.on("relocated", (location: { start?: { cfi?: string; href?: string; percentage?: number } }) => {
        const cfi = location.start?.cfi ?? null;
        setCurrentHref(location.start?.href ?? "");
        const ratio = location.start?.percentage ?? (locationsGenerated && cfi ? book.locations.percentageFromCfi(cfi) : 0);
        const percentage = Math.round(ratio * 100);
        if (!epubReadyRef.current) {
          epubReadyRef.current = true;
          const readyFrame = epubRef.current?.getBoundingClientRect();
          if (readyFrame) epubFrameSizeRef.current = epubFrameSize(readyFrame);
          if (pendingEpubAppearanceAnchorRef.current) requestEpubReflow("appearance", 0);
        }
        setPageProgress(percentage);
        if (locationsGenerated) updatePageNumber(cfi);
        if (canPersistProgress && cfi) persistProgress(progressKey, cfi, percentage);
        finishEpubReflow();
      });
      await rendition.display(savedPosition?.cfi ?? undefined);
      await book.locations.generate(1200);
      if (cancelled) return;
      locationsGenerated = true;
      setLocationsReady(true);
      updatePageNumber(rendition.currentLocation?.()?.start?.cfi);
      if (savedPosition?.cfi) {
        const percentage = Math.round(book.locations.percentageFromCfi(savedPosition.cfi) * 100);
        setPageProgress(percentage);
        saveReadingPosition(progressKey, { cfi: savedPosition.cfi, percentage, updatedAt: savedPosition.updatedAt });
        canPersistProgress = true;
      } else if (savedPosition && savedPosition.percentage > 0) {
        const cfi = book.locations.cfiFromPercentage(savedPosition.percentage / 100);
        canPersistProgress = true;
        if (cfi) await rendition.display(cfi);
      } else {
        canPersistProgress = true;
      }
      if (source.id) {
        const cloudPosition = await loadCloudProgress(source.id).catch(() => null);
        if (cancelled) return;
        const latestLocal = parseReadingPosition(localStorage.getItem(progressKey));
        const cloudIsNewer = Boolean(cloudPosition && (
          !latestLocal
          || !latestLocal.updatedAt
          || Boolean(cloudPosition.updatedAt && cloudPosition.updatedAt >= latestLocal.updatedAt)
        ));
        if (cloudPosition && cloudIsNewer) {
          saveReadingPosition(progressKey, cloudPosition);
          setPageProgress(cloudPosition.percentage);
          const targetCfi = cloudPosition.cfi
            || book.locations.cfiFromPercentage(cloudPosition.percentage / 100);
          if (targetCfi) await rendition.display(targetCfi);
        } else if (latestLocal) {
          void saveCloudProgress(source.id, latestLocal).catch(() => undefined);
        }
      }
    });
    return () => {
      cancelled = true;
      epubReadyRef.current = false;
      pendingEpubReflowRef.current = null;
      activeEpubReflowRef.current = null;
      epubFrameSizeRef.current = null;
      epubLanguageRef.current = null;
      epubContentLayoutSignaturesRef.current.clear();
      if (reflowTimerRef.current) window.clearTimeout(reflowTimerRef.current);
      if (pageFallbackTimerRef.current) window.clearTimeout(pageFallbackTimerRef.current);
      if (selectionTimerRef.current) window.clearTimeout(selectionTimerRef.current);
      frameResizeObserver?.disconnect();
      if (cloudProgressTimerRef.current) window.clearTimeout(cloudProgressTimerRef.current);
      if (source.id && pendingCloudProgressRef.current) {
        void saveCloudProgress(source.id, pendingCloudProgressRef.current).catch(() => undefined);
      }
      for (const hls of hlsInstancesRef.current) hls.destroy();
      hlsInstancesRef.current.clear();
      for (const cleanup of epubMediaCleanupRef.current) cleanup();
      epubMediaCleanupRef.current.clear();
      setImageView(null);
      setEmbedView(null);
      renditionRef.current?.destroy?.();
      book?.destroy?.();
    };
    // settings are applied separately without rebuilding the book
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  function captureSelection() {
    if (source.type !== "text") return;
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? "";
    if (!text || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const paragraph = closestTextBlock(range.startContainer)?.closest<HTMLElement>(".reader-paragraph");
    const paragraphIndex = Number(paragraph?.dataset.paragraphIndex ?? -1);
    const rect = range.getBoundingClientRect();
    const placement = rect.top > 230 ? "above" : "below";
    beginSelection(text, {
      x: Math.min(window.innerWidth - 190, Math.max(190, rect.left + rect.width / 2)),
      y: placement === "above" ? rect.top : rect.bottom,
      placement,
    }, contextFromParagraphs(textParagraphs, paragraphIndex, text));
  }

  function clearSelection() {
    if (pageFallbackTimerRef.current) window.clearTimeout(pageFallbackTimerRef.current);
    pageFallbackTimerRef.current = null;
    if (selectionTimerRef.current) window.clearTimeout(selectionTimerRef.current);
    selectionTimerRef.current = null;
    rewriteAbortRef.current?.abort();
    rewriteAbortRef.current = null;
    window.getSelection()?.removeAllRanges();
    selectedContentsRef.current?.window?.getSelection()?.removeAllRanges();
    if (selectedCfiRef.current) {
      try { renditionRef.current?.annotations.remove(selectedCfiRef.current, "highlight"); } catch { /* no-op */ }
    }
    selectedCfiRef.current = null;
    selectedContentsRef.current = null;
    selectedContextRef.current = null;
    selectedKeyRef.current = "";
    setSelected("");
    setSelectionAnchor(null);
    setRewrite("");
    setRewriteState("idle");
    setAssistanceMode("english");
    setChatDraft("");
    setChatMessages([]);
    setChatState("idle");
    setChatError("");
    setChatSources([]);
  }

  function turnPage(direction: "prev" | "next") {
    clearSelection();
    renditionRef.current?.[direction]();
  }

  function goToPercentage(value: number) {
    if (!locationsReady) return;
    clearSelection();
    setPageProgress(value);
    const cfi = bookRef.current?.locations?.cfiFromPercentage(value / 100);
    if (cfi) {
      if (source.type === "epub") {
        persistProgress(`dawn-reader-progress:${source.id ?? source.file.name}`, cfi, value);
      }
      void renditionRef.current?.display(cfi);
    }
  }

  function goToTocItem(item: EpubTocItem) {
    clearSelection();
    setTocOpen(false);
    void renditionRef.current?.display(item.href);
  }

  function handleShellPointerDown() {
    clearSelection();
  }

  function closeImageView() {
    imageDialogRef.current?.close();
    setImageView(null);
    setImageZoomed(false);
    setImageLoadFailed(false);
    window.setTimeout(() => imageReturnFocusRef.current?.focus(), 0);
  }

  function closeEmbedView() {
    embedDialogRef.current?.close();
    setEmbedView(null);
    window.setTimeout(() => embedReturnFocusRef.current?.focus(), 0);
  }

  function handleStagePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (source.type !== "epub" || !desktopReaderRef.current || event.pointerType !== "mouse" || event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    stageGestureRef.current = {
      startX: event.clientX - rect.left,
      startY: event.clientY - rect.top,
      width: rect.width,
      pointerId: event.pointerId,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleStagePointerUp(event: ReactPointerEvent<HTMLElement>) {
    const gesture = stageGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    stageGestureRef.current = null;
    const rect = event.currentTarget.getBoundingClientRect();
    const direction = desktopPageTurnFromPointer({
      startX: gesture.startX,
      startY: gesture.startY,
      endX: event.clientX - rect.left,
      endY: event.clientY - rect.top,
      width: gesture.width,
      startedOnBlank: true,
      hasSelection: false,
    });
    if (direction) turnPage(direction);
  }

  const readingWidth = settings.pageWidth + 380;
  const paperStyle = {
    "--reader-font-size": `${settings.fontSize}px`,
    "--reader-line-height": settings.lineHeight,
    "--reader-page-width": `${readingWidth}px`,
  } as CSSProperties;
  const anchorStyle = selectionAnchor ? {
    left: `${selectionAnchor.x}px`,
    top: `${Math.max(82, selectionAnchor.y + (selectionAnchor.placement === "above" ? -12 : 12))}px`,
  } : undefined;
  const wordSelection = isSingleWord(selected);
  const assistanceTitle = source.assistantMode === "ask"
    ? "问这段内容"
    : assistanceMode === "chinese"
    ? "中文详解"
    : wordSelection ? "读音与词义" : "简明英文";
  const loadingTitle = assistanceMode === "chinese"
    ? "正在生成中文解释…"
    : wordSelection ? "正在查询读音与词义…" : "正在生成简明英文…";

  return <div className={`reader-shell ${source.type === "epub" ? "reader-shell-epub" : ""} reader-theme-${settings.theme}`} onPointerDown={handleShellPointerDown}>
    <header className="reader-topbar">
      <button className="back-button" onClick={onClose}>← <span>书架</span></button>
      <div className="reader-title"><strong>{displayTitle}</strong>{source.type === "epub" && <small>{pageNumber ? `${pageNumber.current} / ${pageNumber.total}` : `${pageProgress}%`}</small>}</div>
      <div className="reader-actions">
        {source.type === "epub" && !desktopReader && <div className="pencil-switch" role="group" aria-label="Apple Pencil 模式">
          <span>Pencil</span>
          <button className={settings.pencilMode === "page" ? "active" : ""} aria-pressed={settings.pencilMode === "page"} onClick={() => setPencilMode("page")}>翻页</button>
          <button className={settings.pencilMode === "select" ? "active" : ""} aria-pressed={settings.pencilMode === "select"} onClick={() => setPencilMode("select")}>画词</button>
        </div>}
        {source.type === "epub" && <button
          className={`toc-button ${tocOpen ? "active" : ""}`}
          onClick={() => {
            setSettingsOpen(false);
            setTocOpen((open) => !open);
          }}
          aria-label="查看目录"
          aria-expanded={tocOpen}
        ><span aria-hidden="true">☷</span><em>目录</em></button>}
        <button className="type-button" onClick={() => {
          setTocOpen(false);
          setSettingsOpen((open) => !open);
        }} aria-label="阅读设置">Aa</button>
      </div>
      {settingsOpen && <div className="reader-settings" role="dialog" aria-label="阅读设置">
        <div><small>字号</small>{([17, 19, 21] as const).map((size) => <button className={settings.fontSize === size ? "active" : ""} key={size} onClick={() => updateSettings({ fontSize: size })}>A{size === 17 ? "−" : size === 21 ? "+" : ""}</button>)}</div>
        <div><small>行距</small>{([1.55, 1.72, 1.9] as const).map((height, index) => <button className={settings.lineHeight === height ? "active" : ""} key={height} onClick={() => updateSettings({ lineHeight: height })}>{["紧", "适中", "松"][index]}</button>)}</div>
        <div><small>行长</small>{([660, 760, 860] as const).map((width, index) => <button className={settings.pageWidth === width ? "active" : ""} key={width} onClick={() => updateSettings({ pageWidth: width })}>{["短", "适中", "长"][index]}</button>)}</div>
        <div className="setting-two"><small>对齐</small>{(["justify", "start"] as const).map((textAlign, index) => <button className={settings.textAlign === textAlign ? "active" : ""} key={textAlign} onClick={() => updateSettings({ textAlign })}>{["两端", "左齐"][index]}</button>)}</div>
        <div className="setting-two"><small>段落</small>{(["book", "spaced"] as const).map((paragraphStyle, index) => <button className={settings.paragraphStyle === paragraphStyle ? "active" : ""} key={paragraphStyle} onClick={() => updateSettings({ paragraphStyle })}>{["书籍", "段间距"][index]}</button>)}</div>
        {source.type === "epub" && <div className="setting-two"><small>排版</small>{(["dawn", "publisher"] as const).map((typographyMode, index) => <button className={settings.typographyMode === typographyMode ? "active" : ""} key={typographyMode} onClick={() => updateSettings({ typographyMode })}>{["Dawn", "原版"][index]}</button>)}</div>}
        <div><small>纸色</small>{(["paper", "sepia", "night"] as const).map((theme, index) => <button className={`theme-dot swatch-${theme} ${settings.theme === theme ? "active" : ""}`} aria-label={["纸白", "暖褐", "夜读"][index]} key={theme} onClick={() => updateSettings({ theme })} />)}</div>
        {source.type === "epub" && <div><small>位置</small>{([25, 50, 75] as const).map((value) => <button className={Math.abs(pageProgress - value) < 2 ? "active" : ""} disabled={!locationsReady} key={value} onClick={() => goToPercentage(value)}>{value}%</button>)}</div>}
      </div>}
    </header>

    {source.type === "epub" && tocOpen && <div className="toc-layer">
      <button className="toc-backdrop" aria-label="关闭目录" onClick={() => setTocOpen(false)} />
      <aside className="toc-panel" ref={tocPanelRef} role="dialog" aria-modal="true" aria-label="本书目录">
        <header>
          <div><small>CONTENTS</small><h2>目录</h2></div>
          <button onClick={() => setTocOpen(false)} aria-label="关闭目录">×</button>
        </header>
        <div className="toc-scroll">
          {!tocLoaded ? <p className="toc-empty">正在读取目录…</p>
            : tocItems.length > 0 ? <TocItems items={tocItems} currentHref={currentHref} onNavigate={goToTocItem} />
            : <p className="toc-empty">这本书没有提供可用的目录。</p>}
        </div>
      </aside>
    </div>}

    <main
      ref={readingStageRef}
      className={`reading-stage ${source.type === "epub" ? "epub-stage" : ""}`}
      style={paperStyle}
      onPointerDown={handleStagePointerDown}
      onPointerUp={handleStagePointerUp}
      onPointerCancel={() => { stageGestureRef.current = null; }}
    >
      {source.type === "text" ? <article
        className={`paper paper-${settings.theme}`}
        data-dawn-paragraph-style={settings.paragraphStyle}
        data-dawn-text-align={settings.textAlign}
        data-dawn-typography-mode={settings.typographyMode}
        onMouseUp={captureSelection}
        onPointerUp={(event) => {
        if (event.pointerType === "pen" && settings.pencilMode === "select") captureSelection();
      }}>
        <h1>{displayTitle}</h1>
        <div className="reading-columns">
          {textParagraphs.map((paragraph, index) => <p className="reader-paragraph" data-paragraph-index={index} key={index}>{paragraph}</p>)}
        </div>
      </article> : <div className={`epub-frame epub-${settings.theme}`} style={{ maxWidth: readingWidth }} ref={epubRef} />}
    </main>

    {source.type === "epub" && <nav className="reader-bottombar" aria-label="阅读导航">
      <div className="page-controls" style={{ maxWidth: readingWidth }}>
        <button onClick={() => turnPage("prev")} aria-label="上一页">←</button>
        <label className="progress-scrubber">
          <input
            aria-label="阅读进度"
            aria-valuetext={pageNumber ? `第 ${pageNumber.current} 页，共 ${pageNumber.total} 页` : `${pageProgress}%`}
            type="range"
            min="0"
            max="100"
            value={pageProgress}
            disabled={!locationsReady}
            onChange={(event) => goToPercentage(Number(event.target.value))}
          />
          <span
            className="page-position"
            title={pageNumber?.source === "publisher" ? "电子书内置页码" : "按阅读位置计算的页码"}
          >
            <b>{pageNumber ? `${pageNumber.current} / ${pageNumber.total}` : "…"}</b>
            <small>{locationsReady ? `${pageProgress}%` : ""}</small>
          </span>
        </label>
        <button onClick={() => turnPage("next")} aria-label="下一页">→</button>
      </div>
    </nav>}

    {imageView && <dialog
      ref={imageDialogRef}
      className={`image-viewer ${imageZoomed ? "zoomed" : "fitted"}`}
      aria-labelledby="image-viewer-title"
      onCancel={(event) => {
        event.preventDefault();
        closeImageView();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeImageView();
      }}
    >
      <header>
        <div>
          <small>FIGURE</small>
          <h2 id="image-viewer-title">{imageView.label}</h2>
        </div>
        <div className="image-viewer-actions">
          {!imageLoadFailed && <button
            type="button"
            aria-pressed={imageZoomed}
            onClick={() => setImageZoomed((zoomed) => !zoomed)}
          >{imageZoomed ? "适应窗口" : "查看原始尺寸"}</button>}
          {imageView.sourceHref && <a href={imageView.sourceHref} target="_blank" rel="noopener noreferrer">打开原图</a>}
          <button className="image-viewer-close" type="button" aria-label="关闭大图" onClick={closeImageView}>×</button>
        </div>
      </header>
      <div className="image-viewer-canvas" data-state={imageLoadFailed ? "error" : "ready"}>
        {imageLoadFailed
          ? <div className="image-viewer-error" role="alert"><strong>图片无法显示</strong><span>可以尝试从原图链接打开。</span></div>
          : <img src={imageView.source} alt="" onError={() => setImageLoadFailed(true)} />}
      </div>
      {imageView.caption && <p className="image-viewer-caption">{imageView.caption}</p>}
      <p className="image-viewer-hint">Esc 关闭 · 点击留白关闭 · 可拖动或双指缩放</p>
    </dialog>}

    {embedView && <dialog
      ref={embedDialogRef}
      className="embed-viewer"
      aria-labelledby="embed-viewer-title"
      onCancel={(event) => {
        event.preventDefault();
        closeEmbedView();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeEmbedView();
      }}
    >
      <header>
        <div><small>MEDIA</small><h2 id="embed-viewer-title">{embedView.title}</h2></div>
        <div>
          <a href={embedView.source} target="_blank" rel="noopener noreferrer">在浏览器中打开</a>
          <button type="button" aria-label="关闭视频" onClick={closeEmbedView}>×</button>
        </div>
      </header>
      <iframe
        src={embedView.source}
        title={embedView.title}
        allow="fullscreen; picture-in-picture; encrypted-media"
        sandbox="allow-scripts allow-same-origin allow-presentation"
        referrerPolicy="no-referrer"
        allowFullScreen
      />
    </dialog>}

    {selected && selectionAnchor && <aside
      className={`selection-assist ${source.assistantMode === "ask" ? "ask-mode" : "rewrite-mode"} ${selectionAnchor.placement} ${source.assistantMode === "ask" ? chatState : rewriteState}`}
      style={anchorStyle}
      role="dialog"
      aria-label={assistanceTitle}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header>
        <span>{assistanceTitle}</span>
        <div>
          {source.assistantMode === "ask" && <small className="chat-capability">局部上下文{searchAvailable ? " · 可联网" : ""}</small>}
          {source.assistantMode === "rewrite" && assistanceMode === "english" && rewriteState === "complete" && <button type="button" onClick={requestChineseDetail}>中文详解</button>}
          <button className="assist-close" type="button" aria-label="关闭解释" onClick={clearSelection}>×</button>
        </div>
      </header>
      {source.assistantMode === "rewrite" ? <div role="status" aria-live="polite">
          {rewrite ? <p className="rewrite-result">{rewrite}</p> : <div className="rewrite-wait"><i /><span>{loadingTitle}</span></div>}
          {rewriteState === "error" && <button className="assist-retry" type="button" onClick={retryAssistance}>重试</button>}
        </div> : <div className="selection-chat">
          <div className="chat-selection"><span>选中</span><p>{selected}</p></div>
          {chatMessages.length > 0 && <div className="chat-thread" aria-live="polite">
            {chatMessages.map((message, index) => <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
              <small>{message.role === "user" ? "你" : "AI"}</small>
              <p>{message.content}</p>
            </div>)}
            {chatState === "loading" && <div className="chat-thinking"><i /><span>{searchAvailable ? "正在阅读，必要时搜索…" : "正在结合上下文思考…"}</span></div>}
            {chatSources.length > 0 && <div className="chat-sources">
              <small>来源</small>
              {chatSources.map((item, index) => <a href={item.url} target="_blank" rel="noreferrer" key={item.url}>[{index + 1}] {item.title}</a>)}
            </div>}
            <div ref={chatEndRef} />
          </div>}
          {chatState === "error" && <div className="chat-error" role="alert"><span>{chatError}</span><button type="button" onClick={() => {
            const last = chatMessages.at(-1);
            if (last?.role === "user") void sendQuestion(last.content, chatMessages.slice(0, -1));
          }}>重试</button></div>}
          <form className="chat-compose" onSubmit={submitQuestion}>
            <textarea
              autoFocus
              aria-label="向 AI 提问"
              placeholder={chatMessages.length ? "继续问…" : searchAvailable ? "问这段内容，必要时搜索…" : "你想弄懂什么？"}
              rows={2}
              value={chatDraft}
              onChange={(event) => setChatDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button type="submit" disabled={!chatDraft.trim() || chatState === "loading"} aria-label="发送问题">↑</button>
          </form>
        </div>}
    </aside>}
  </div>;
}
