import { useEffect, useRef, useState, type CSSProperties } from "react";
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
import { loadCloudProgress, saveCloudProgress, saveCloudState } from "../lib/cloudSync";
import {
  pageTurnFromPointer,
  pointerInputKind,
  shouldTurnPage,
  touchInputKind,
  type ReaderInputKind,
} from "../lib/pencilInput";

type RewriteState = "idle" | "loading" | "complete" | "error";
type AssistanceMode = "english" | "chinese";
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
  pointerId?: number;
};
type CaretPoint = { node: Node; offset: number };

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
  const bookRef = useRef<any>(null);
  const renditionRef = useRef<any>(null);
  const selectedCfiRef = useRef<string | null>(null);
  const selectedContentsRef = useRef<any>(null);
  const selectedContextRef = useRef<RewriteContext | null>(null);
  const rewriteAbortRef = useRef<AbortController | null>(null);
  const reflowTimerRef = useRef<number | null>(null);
  const cloudProgressTimerRef = useRef<number | null>(null);
  const pendingCloudProgressRef = useRef<ReturnType<typeof saveReadingPosition> | null>(null);
  const pencilModeRef = useRef(loadReaderSettings().pencilMode);
  const gestureRef = useRef<GestureState | null>(null);
  const pageFallbackTimerRef = useRef<number | null>(null);
  const selectionTimerRef = useRef<number | null>(null);
  const selectedKeyRef = useRef("");
  const selectionInputRef = useRef<ReaderInputKind>("mouse");
  const [displayTitle, setDisplayTitle] = useState(source.title);
  const [selected, setSelected] = useState("");
  const [selectionAnchor, setSelectionAnchor] = useState<SelectionAnchor | null>(null);
  const [rewrite, setRewrite] = useState("");
  const [rewriteState, setRewriteState] = useState<RewriteState>("idle");
  const [assistanceMode, setAssistanceMode] = useState<AssistanceMode>("english");
  const [pageProgress, setPageProgress] = useState(0);
  const [locationsReady, setLocationsReady] = useState(false);
  const [settings, setSettings] = useState<ReaderSettings>(loadReaderSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const textParagraphs = source.type === "text" ? source.text.split(/\n\s*\n/).filter(Boolean) : [];

  function updateSettings(patch: Partial<ReaderSettings>) {
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
    const root = contents?.document?.documentElement as HTMLElement | undefined;
    const body = contents?.document?.body as HTMLElement | undefined;
    for (const element of [root, body]) {
      element?.style.setProperty("touch-action", "pan-y pinch-zoom", "important");
      element?.style.setProperty("overscroll-behavior", "none", "important");
      element?.style.setProperty("user-select", mode === "page" ? "none" : "text", "important");
      element?.style.setProperty("-webkit-user-select", mode === "page" ? "none" : "text", "important");
      element?.setAttribute("data-dawn-pencil-mode", mode);
    }
  }

  function applyPencilModeToOpenContents(mode: PencilMode) {
    const contents = renditionRef.current?.getContents?.() ?? [];
    for (const content of contents) applyPencilModeToContents(content, mode);
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
        "font-family": "Iowan Old Style, Baskerville, Georgia, serif !important",
        color: `${colors.color} !important`,
        background: `${colors.background} !important`,
        padding: "24px 34px !important",
      },
      "p, li, blockquote": {
        "font-size": "inherit !important",
        "line-height": "inherit !important",
      },
      a: { color: next.theme === "night" ? "#efa06a !important" : "#a65332 !important" },
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
    void requestRewrite(text, context, "english");
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

  function startGesture(kind: ReaderInputKind, x: number, y: number, pointerId?: number, touchSeen = false) {
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

  useEffect(() => {
    document.documentElement.classList.add("reader-active");
    document.body.classList.add("reader-active");
    return () => {
      document.documentElement.classList.remove("reader-active");
      document.body.classList.remove("reader-active");
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearSelection();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected]);

  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    const currentCfi = rendition.currentLocation?.()?.start?.cfi;
    applyEpubTheme(rendition);
    rendition.spread?.("auto", 900);
    if (reflowTimerRef.current) window.clearTimeout(reflowTimerRef.current);
    reflowTimerRef.current = window.setTimeout(() => {
      rendition.clear?.();
      void rendition.display?.(currentCfi);
    }, 60);
    return () => {
      if (reflowTimerRef.current) window.clearTimeout(reflowTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.fontSize, settings.lineHeight, settings.pageWidth, settings.theme]);

  useEffect(() => {
    if (source.type !== "epub" || !epubRef.current) return;
    let cancelled = false;
    let book: any;
    let frameResizeObserver: ResizeObserver | null = null;
    let frameResizeTimer: number | null = null;
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
      book.loaded.metadata.then((metadata: { title?: string }) => {
        if (metadata.title) setDisplayTitle(metadata.title.trim());
      }).catch(() => undefined);
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
      applyEpubTheme(rendition);
      rendition.hooks.content.register((contents: any) => {
        const document = contents.document as Document;
        applyPencilModeToContents(contents, pencilModeRef.current);

        const onPointerDown = (event: PointerEvent) => {
          const kind = pointerInputKind(event.pointerType);
          selectionInputRef.current = kind;
          if (gestureRef.current && gestureRef.current.pointerId === undefined) {
            gestureRef.current.pointerId = event.pointerId;
            if (kind === "pen") gestureRef.current.kind = "pen";
            return;
          }
          startGesture(kind, event.clientX, event.clientY, event.pointerId);
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
            startGesture(kind, touch.clientX, touch.clientY, undefined, true);
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

        document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: false });
        document.addEventListener("pointermove", onPointerMove, { capture: true, passive: false });
        document.addEventListener("pointerup", onPointerUp, { capture: true, passive: false });
        document.addEventListener("pointercancel", onPointerCancel, { capture: true, passive: false });
        document.addEventListener("touchstart", onTouchStart, { capture: true, passive: false });
        document.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
        document.addEventListener("touchend", onTouchEnd, { capture: true, passive: false });
        document.addEventListener("touchcancel", () => { gestureRef.current = null; }, { capture: true, passive: false });
        document.addEventListener("selectionchange", onSelectionChange, { passive: true });
      });
      rendition.on("selected", (cfiRange: string, contents: any) => {
        captureEpubSelection(contents, cfiRange);
      });
      let observedWidth = Math.floor(initialFrame.width);
      let observedHeight = Math.floor(initialFrame.height);
      frameResizeObserver = new ResizeObserver(([entry]) => {
        const width = Math.floor(entry.contentRect.width);
        const height = Math.floor(entry.contentRect.height);
        if (width < 1 || height < 1 || (Math.abs(width - observedWidth) < 2 && Math.abs(height - observedHeight) < 2)) return;
        observedWidth = width;
        observedHeight = height;
        if (frameResizeTimer) window.clearTimeout(frameResizeTimer);
        frameResizeTimer = window.setTimeout(() => {
          const currentCfi = rendition.currentLocation?.()?.start?.cfi;
          rendition.resize(width, height, currentCfi);
        }, 120);
      });
      frameResizeObserver.observe(epubRef.current);
      rendition.on("relocated", (location: { start?: { cfi?: string; percentage?: number } }) => {
        const cfi = location.start?.cfi ?? null;
        const ratio = location.start?.percentage ?? (locationsGenerated && cfi ? book.locations.percentageFromCfi(cfi) : 0);
        const percentage = Math.round(ratio * 100);
        setPageProgress(percentage);
        if (canPersistProgress && cfi) persistProgress(progressKey, cfi, percentage);
      });
      await rendition.display(savedPosition?.cfi ?? undefined);
      await book.locations.generate(1200);
      if (cancelled) return;
      locationsGenerated = true;
      setLocationsReady(true);
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
      if (reflowTimerRef.current) window.clearTimeout(reflowTimerRef.current);
      if (pageFallbackTimerRef.current) window.clearTimeout(pageFallbackTimerRef.current);
      if (selectionTimerRef.current) window.clearTimeout(selectionTimerRef.current);
      if (frameResizeTimer) window.clearTimeout(frameResizeTimer);
      frameResizeObserver?.disconnect();
      if (cloudProgressTimerRef.current) window.clearTimeout(cloudProgressTimerRef.current);
      if (source.id && pendingCloudProgressRef.current) {
        void saveCloudProgress(source.id, pendingCloudProgressRef.current).catch(() => undefined);
      }
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

  function handleShellPointerDown() {
    clearSelection();
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
  const assistanceTitle = assistanceMode === "chinese"
    ? "中文详解"
    : wordSelection ? "读音与词义" : "简明英文";
  const loadingTitle = assistanceMode === "chinese"
    ? "正在生成中文解释…"
    : wordSelection ? "正在查询读音与词义…" : "正在生成简明英文…";

  return <div className={`reader-shell reader-theme-${settings.theme}`} onPointerDown={handleShellPointerDown}>
    <header className="reader-topbar">
      <button className="back-button" onClick={onClose}>← <span>书架</span></button>
      <div className="reader-title"><strong>{displayTitle}</strong>{source.type === "epub" && <small>{pageProgress}%</small>}</div>
      <div className="reader-actions">
        {source.type === "epub" && <div className="pencil-switch" role="group" aria-label="Apple Pencil 模式">
          <span>Pencil</span>
          <button className={settings.pencilMode === "page" ? "active" : ""} aria-pressed={settings.pencilMode === "page"} onClick={() => setPencilMode("page")}>翻页</button>
          <button className={settings.pencilMode === "select" ? "active" : ""} aria-pressed={settings.pencilMode === "select"} onClick={() => setPencilMode("select")}>画词</button>
        </div>}
        <button className="type-button" onClick={() => setSettingsOpen((open) => !open)} aria-label="阅读设置">Aa</button>
      </div>
      {settingsOpen && <div className="reader-settings" role="dialog" aria-label="阅读设置">
        <div><small>字号</small>{([17, 19, 21] as const).map((size) => <button className={settings.fontSize === size ? "active" : ""} key={size} onClick={() => updateSettings({ fontSize: size })}>A{size === 17 ? "−" : size === 21 ? "+" : ""}</button>)}</div>
        <div><small>行距</small>{([1.55, 1.72, 1.9] as const).map((height, index) => <button className={settings.lineHeight === height ? "active" : ""} key={height} onClick={() => updateSettings({ lineHeight: height })}>{["紧", "适中", "松"][index]}</button>)}</div>
        <div><small>版心</small>{([660, 760, 860] as const).map((width, index) => <button className={settings.pageWidth === width ? "active" : ""} key={width} onClick={() => updateSettings({ pageWidth: width })}>{["窄", "适中", "宽"][index]}</button>)}</div>
        <div><small>纸色</small>{(["paper", "sepia", "night"] as const).map((theme, index) => <button className={`theme-dot swatch-${theme} ${settings.theme === theme ? "active" : ""}`} aria-label={["纸白", "暖褐", "夜读"][index]} key={theme} onClick={() => updateSettings({ theme })} />)}</div>
        {source.type === "epub" && <div><small>位置</small>{([25, 50, 75] as const).map((value) => <button className={Math.abs(pageProgress - value) < 2 ? "active" : ""} disabled={!locationsReady} key={value} onClick={() => goToPercentage(value)}>{value}%</button>)}</div>}
      </div>}
    </header>

    <main className={`reading-stage ${source.type === "epub" ? "epub-stage" : ""}`} style={paperStyle}>
      {source.type === "text" ? <article className={`paper paper-${settings.theme}`} onMouseUp={captureSelection} onPointerUp={(event) => {
        if (event.pointerType === "pen" && settings.pencilMode === "select") captureSelection();
      }}>
        <h1>{displayTitle}</h1>
        <div className="reading-columns">
          {textParagraphs.map((paragraph, index) => <p className="reader-paragraph" data-paragraph-index={index} key={index}>{paragraph}</p>)}
        </div>
      </article> : <div className={`epub-frame epub-${settings.theme}`} style={{ maxWidth: readingWidth }} ref={epubRef} />}
      {source.type === "epub" && <div className="page-controls" style={{ maxWidth: readingWidth }}>
        <button onClick={() => turnPage("prev")} aria-label="上一页">←</button>
        <label className="progress-scrubber">
          <input aria-label="阅读进度" type="range" min="0" max="100" value={pageProgress} disabled={!locationsReady} onChange={(event) => goToPercentage(Number(event.target.value))} />
          <span>{locationsReady ? `${pageProgress}%` : "…"}</span>
        </label>
        <button onClick={() => turnPage("next")} aria-label="下一页">→</button>
      </div>}
    </main>

    {selected && selectionAnchor && <aside
      className={`selection-assist ${selectionAnchor.placement} ${rewriteState}`}
      style={anchorStyle}
      role="dialog"
      aria-label={assistanceTitle}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header>
        <span>{assistanceTitle}</span>
        <div>
          {assistanceMode === "english" && rewriteState === "complete" && <button type="button" onClick={requestChineseDetail}>中文详解</button>}
          <button className="assist-close" type="button" aria-label="关闭解释" onClick={clearSelection}>×</button>
        </div>
      </header>
      <div role="status" aria-live="polite">
        {rewrite ? <p>{rewrite}</p> : <div className="rewrite-wait"><i /><span>{loadingTitle}</span></div>}
        {rewriteState === "error" && <button className="assist-retry" type="button" onClick={retryAssistance}>重试</button>}
      </div>
    </aside>}
  </div>;
}
