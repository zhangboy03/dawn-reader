import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "pdfjs-dist/web/pdf_viewer.css";
import type { ReaderProfile } from "../../lib/storage";
import { loadLegacyPdfAppearanceTheme, pdfAppearancePageFilter, pdfAppearanceTone } from "../../lib/pdfAppearance";
import { loadReaderSettings, saveReaderSettings, type ReaderSettings, type ReaderTheme } from "../../lib/readerSettings";
import { saveCloudState } from "../../lib/cloudSync";
import {
  DAWN_YELLOW,
  addPdfHighlight,
  clientRectToPdfQuad,
  deletePdfHighlightSidecar,
  loadPdfHighlightSidecar,
  pdfQuadToViewportRect,
  removePdfHighlight,
  type PdfHighlight,
  type PdfHighlightSidecar,
  type PdfQuad,
} from "../../lib/pdfHighlights";
import {
  loadPdfLocator,
  savePdfLocator,
  type PdfFitMode,
  type PdfLocator,
} from "../../lib/pdfLocator";
import { createPdfViewerResizeController } from "../../lib/pdfViewerResize";
import { createPdfBlobRangeTransport, LOCAL_PDF_RANGE_CHUNK_BYTES } from "../../lib/pdfBlobRangeTransport";
import { selectionAssistAnchorFromPdfQuads } from "../../lib/pdfSelectionAssistAnchor";
import {
  selectionAssistAnchorFromRects,
  selectionAssistDirection,
  type SelectionAssistAnchor,
  type SelectionAssistPoint,
  type SelectionAssistVisibleBounds,
} from "../../lib/selectionAssistAnchor";
import { visualViewportRect } from "../../lib/selectionAssistPosition";
import {
  boundedSelectionContext,
  initialSelectionAssistanceState,
  requestSelectionAssistance,
  type SelectionAssistanceState,
  type SelectionContext,
} from "../../lib/selectionAssistance";
import {
  loadBookAssistantModes,
  saveBookAssistantMode,
  type BookAssistantMode,
} from "../../lib/bookAssistantMode";
import type {
  SelectionChatMessage,
  SelectionChatSource,
  SelectionChatState,
} from "../selection-assist/SelectionChat";
import { AssistantModeToggle } from "../AssistantModeToggle";
import { PdfSelectionCard, type SelectionCardAnchor } from "./PdfSelectionCard";
import "../../pdf-reader.css";

export type PdfSource = {
  type: "pdf";
  id: string;
  title: string;
  file: File;
};

type OutlineItem = {
  title: string;
  dest: unknown;
  url?: string | null;
  items?: OutlineItem[];
};

type SelectionSnapshot = {
  text: string;
  context: SelectionContext;
  pageIndex: number;
  quads: PdfQuad[];
  anchor: SelectionCardAnchor;
};

type LoadFailure = {
  kind: "malformed" | "memory" | "missing" | "unknown";
  title: string;
  detail: string;
};

const MAX_CANVAS_PIXELS = 16_777_216;
const MAX_CANVAS_DIMENSION = 8192;
const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
const LARGE_FILE_BYTES = 100 * 1024 * 1024;
const SEARCH_DEBOUNCE_MS = 250;
const PDF_APPEARANCE_OPTIONS = [
  { theme: "paper", label: "原色" },
  { theme: "sepia", label: "暖纸" },
  { theme: "night", label: "夜读" },
] as const;

export function pdfSearchStatusLabel(query: string, phase: "idle" | "searching" | "done", current: number, total: number) {
  if (!query.trim()) return "";
  if (phase === "searching") return "正在搜索…";
  return total > 0 ? `${current} / ${total}` : "0 个结果";
}

type PdfRuntime = {
  pdfjsLib: typeof import("pdfjs-dist");
  viewerModule: typeof import("pdfjs-dist/web/pdf_viewer.mjs");
};

let pdfRuntimePromise: Promise<PdfRuntime> | null = null;

export function preloadPdfRuntime() {
  if (!pdfRuntimePromise) {
    pdfRuntimePromise = import("pdfjs-dist").then(async (pdfjsLib) => {
      // The published viewer bundle reads its core API from this global.
      (globalThis as typeof globalThis & { pdfjsLib?: typeof pdfjsLib }).pdfjsLib = pdfjsLib;
      const viewerModule = await import("pdfjs-dist/web/pdf_viewer.mjs");
      return { pdfjsLib, viewerModule };
    }).catch((error) => {
      pdfRuntimePromise = null;
      throw error;
    });
  }
  return pdfRuntimePromise;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function currentPdfVisualBounds(): SelectionAssistVisibleBounds {
  const viewport = visualViewportRect(window.visualViewport, {
    width: window.innerWidth,
    height: window.innerHeight,
  });
  return {
    left: viewport.left,
    top: viewport.top,
    right: viewport.left + viewport.width,
    bottom: viewport.top + viewport.height,
  };
}

function intersectPdfBounds(
  first: SelectionAssistVisibleBounds,
  second: SelectionAssistVisibleBounds,
): SelectionAssistVisibleBounds {
  const left = Math.max(first.left, second.left);
  const top = Math.max(first.top, second.top);
  return {
    left,
    top,
    right: Math.max(left, Math.min(first.right, second.right)),
    bottom: Math.max(top, Math.min(first.bottom, second.bottom)),
  };
}

function failureFor(error: unknown): LoadFailure {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/InvalidPDF|FormatError|malformed|invalid pdf/i.test(`${name} ${message}`)) {
    return { kind: "malformed", title: "这个 PDF 无法解析。", detail: "文件可能损坏或结构不完整；Dawn 没有修改源文件。" };
  }
  if (/MissingPDF|not found/i.test(`${name} ${message}`)) {
    return { kind: "missing", title: "本机 PDF 副本不可用。", detail: "请返回书架重新导入原文件。" };
  }
  if (/memory|allocation|canvas|Array buffer allocation failed/i.test(`${name} ${message}`)) {
    return { kind: "memory", title: "PDF 超出当前浏览器的内存预算。", detail: "关闭其他大型页面后重试，或使用更小的文件。源 PDF 未被修改。" };
  }
  return { kind: "unknown", title: "PDF 未能打开。", detail: message || "浏览器无法完成本次加载。" };
}

function hostLabel(raw: string) {
  try {
    const url = new URL(raw, window.location.href);
    return url.protocol === "http:" || url.protocol === "https:" ? url.host : `${url.protocol.replace(":", "")} 链接`;
  } catch {
    return "未知目标";
  }
}

function isExternalNavigableLink(raw: string) {
  try {
    const url = new URL(raw, window.location.href);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function outlineKey(item: OutlineItem, index: number) {
  return `${item.title}:${index}:${String(item.dest ?? item.url ?? "")}`;
}

export function PdfReader({ source, profile, onClose }: {
  source: PdfSource;
  profile: ReaderProfile;
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const viewerElementRef = useRef<HTMLDivElement>(null);
  const appearanceToggleRef = useRef<HTMLButtonElement>(null);
  const pdfDocumentRef = useRef<any>(null);
  const pdfViewerRef = useRef<any>(null);
  const linkServiceRef = useRef<any>(null);
  const findControllerRef = useRef<any>(null);
  const eventBusRef = useRef<any>(null);
  const loadingTaskRef = useRef<any>(null);
  const passwordUpdateRef = useRef<((password: string) => void) | null>(null);
  const englishControllerRef = useRef<AbortController | null>(null);
  const chineseControllerRef = useRef<AbortController | null>(null);
  const chatControllerRef = useRef<AbortController | null>(null);
  const selectionVersionRef = useRef(0);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSearchQueryRef = useRef("");
  const selectionCaptureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoredRef = useRef(false);
  const fitRef = useRef<PdfFitMode>("width");
  const scaleRef = useRef(1);
  const sidecarRef = useRef<PdfHighlightSidecar>(loadPdfHighlightSidecar(source.id));
  const legacyPdfThemeRef = useRef<ReaderTheme | null | undefined>(undefined);
  if (legacyPdfThemeRef.current === undefined) legacyPdfThemeRef.current = loadLegacyPdfAppearanceTheme();

  const [status, setStatus] = useState<"loading" | "password" | "ready" | "error">("loading");
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [passwordReason, setPasswordReason] = useState<"needed" | "incorrect">("needed");
  const [password, setPassword] = useState("");
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [pageCount, setPageCount] = useState(0);
  const [fit, setFit] = useState<PdfFitMode>("width");
  const [scale, setScale] = useState(1);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCount, setSearchCount] = useState({ current: 0, total: 0 });
  const [searchPhase, setSearchPhase] = useState<"idle" | "searching" | "done">("idle");
  const [noSelectableText, setNoSelectableText] = useState(false);
  const [pageFailures, setPageFailures] = useState<number[]>([]);
  const [notice, setNotice] = useState(() => {
    const messages: string[] = [];
    if (source.file.size > LARGE_FILE_BYTES) messages.push("这是大型 PDF；Dawn 会按可见页渲染并限制单页画布尺寸。");
    const discarded = sidecarRef.current.recovery?.discarded ?? 0;
    if (discarded > 0) messages.push(`已隔离 ${discarded} 条无法验证的旧高亮记录；PDF 仍可正常阅读。`);
    return messages.join(" ");
  });
  const [selection, setSelection] = useState<SelectionSnapshot | null>(null);
  const [assistantMode, setAssistantMode] = useState<BookAssistantMode>(() => loadBookAssistantModes()[source.id] ?? "rewrite");
  const [assistance, setAssistance] = useState<SelectionAssistanceState>(initialSelectionAssistanceState);
  const [chatDraft, setChatDraft] = useState("");
  const [chatMessages, setChatMessages] = useState<SelectionChatMessage[]>([]);
  const [chatState, setChatState] = useState<SelectionChatState>("idle");
  const [chatError, setChatError] = useState("");
  const [chatSources, setChatSources] = useState<SelectionChatSource[]>([]);
  const [highlightState, setHighlightState] = useState<{ phase: "idle" | "saving" | "saved" | "error"; message: string }>({ phase: "idle", message: "" });
  const [sidecar, setSidecar] = useState(sidecarRef.current);
  const [activeHighlight, setActiveHighlight] = useState<{ id: string; left: number; top: number } | null>(null);
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() => {
    const current = loadReaderSettings();
    const legacyTheme = legacyPdfThemeRef.current;
    legacyPdfThemeRef.current = null;
    return legacyTheme ? { ...current, theme: legacyTheme } : current;
  });
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [appearanceAnchor, setAppearanceAnchor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => { sidecarRef.current = sidecar; }, [sidecar]);
  useEffect(() => { fitRef.current = fit; }, [fit]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { setPageInput(String(pageNumber)); }, [pageNumber]);

  const updatePdfTheme = useCallback((theme: ReaderTheme) => {
    setReaderSettings((current) => {
      const next = { ...current, theme };
      saveReaderSettings(next);
      void saveCloudState({ settings: next }).catch(() => undefined);
      return next;
    });
  }, []);

  const syncAppearanceAnchor = useCallback(() => {
    const toggle = appearanceToggleRef.current;
    if (!toggle) return;
    const toggleBounds = toggle.getBoundingClientRect();
    setAppearanceAnchor({
      x: toggleBounds.left + toggleBounds.width / 2,
      y: toggleBounds.bottom + 8,
    });
  }, []);

  useEffect(() => {
    if (!appearanceOpen) return;
    syncAppearanceAnchor();
    const visualViewport = window.visualViewport;
    window.addEventListener("resize", syncAppearanceAnchor);
    visualViewport?.addEventListener("resize", syncAppearanceAnchor);
    return () => {
      window.removeEventListener("resize", syncAppearanceAnchor);
      visualViewport?.removeEventListener("resize", syncAppearanceAnchor);
    };
  }, [appearanceOpen, syncAppearanceAnchor]);

  const closeSelection = useCallback(() => {
    if (selectionCaptureTimerRef.current) clearTimeout(selectionCaptureTimerRef.current);
    selectionCaptureTimerRef.current = null;
    englishControllerRef.current?.abort();
    chineseControllerRef.current?.abort();
    chatControllerRef.current?.abort();
    selectionVersionRef.current += 1;
    setSelection(null);
    setAssistance(initialSelectionAssistanceState);
    setChatDraft("");
    setChatMessages([]);
    setChatState("idle");
    setChatError("");
    setChatSources([]);
    setHighlightState({ phase: "idle", message: "" });
    window.getSelection()?.removeAllRanges();
    scrollRef.current?.focus({ preventScroll: true });
  }, []);

  const renderHighlightsForPage = useCallback((pageIndex: number) => {
    const pageView = pdfViewerRef.current?._pages?.[pageIndex];
    if (!pageView?.div || !pageView.viewport) return;
    let layer = pageView.div.querySelector(":scope > .dawn-pdf-highlight-layer") as HTMLElement | null;
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "dawn-pdf-highlight-layer";
      pageView.div.appendChild(layer);
    }
    layer.replaceChildren();
    for (const highlight of sidecarRef.current.highlights.filter((item) => item.pageIndex === pageIndex)) {
      for (const quad of highlight.quads) {
        const rect = pdfQuadToViewportRect(quad, pageView.viewport);
        if (!rect) continue;
        const mark = document.createElement("button");
        mark.type = "button";
        mark.className = "dawn-pdf-highlight-mark";
        mark.setAttribute("aria-label", "Dawn 黄色高亮");
        mark.dataset.highlightId = highlight.id;
        Object.assign(mark.style, {
          left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
        });
        mark.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const bounds = mark.getBoundingClientRect();
          setActiveHighlight({ id: highlight.id, left: bounds.left, top: bounds.bottom + 6 });
        });
        layer.appendChild(mark);
      }
    }
  }, []);

  const renderAllHighlights = useCallback(() => {
    const pages = pdfViewerRef.current?._pages ?? [];
    for (let index = 0; index < pages.length; index += 1) renderHighlightsForPage(index);
  }, [renderHighlightsForPage]);

  useEffect(() => { renderAllHighlights(); }, [sidecar, renderAllHighlights]);

  const persistPosition = useCallback(() => {
    const viewer = pdfViewerRef.current;
    const container = scrollRef.current;
    if (!viewer || !container || !source.id || !viewer.pagesCount) return;
    const pageIndex = Math.max(0, viewer.currentPageNumber - 1);
    const pageView = viewer._pages?.[pageIndex];
    const pageTop = pageView?.div?.offsetTop ?? container.scrollTop;
    const pageHeight = pageView?.div?.clientHeight || 1;
    const locator: PdfLocator = {
      type: "pdf",
      version: 1,
      pageIndex,
      offset: clamp((container.scrollTop - pageTop) / pageHeight, 0, 1),
      fit: fitRef.current,
      scale: fitRef.current === "custom" ? clamp(viewer.currentScale || scaleRef.current, MIN_SCALE, MAX_SCALE) : null,
      updatedAt: new Date().toISOString(),
    };
    savePdfLocator(source.id, locator);
  }, [source.id]);

  const schedulePersist = useCallback(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(persistPosition, 250);
  }, [persistPosition]);

  useEffect(() => {
    let cancelled = false;
    let localEventBus: any = null;
    let supplementaryStarted = false;
    let supplementaryIdleId: number | null = null;
    let supplementaryTimer: ReturnType<typeof setTimeout> | null = null;
    const listeners: Array<[string, (event: any) => void]> = [];
    const on = (name: string, handler: (event: any) => void) => {
      (localEventBus?.on ?? localEventBus?._on)?.call(localEventBus, name, handler);
      listeners.push([name, handler]);
    };

    async function openPdf() {
      setStatus("loading");
      setFailure(null);
      restoredRef.current = false;
      try {
        const { pdfjsLib, viewerModule } = await preloadPdfRuntime();
        if (cancelled) return;
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
        const container = scrollRef.current;
        const viewerElement = viewerElementRef.current;
        if (!container || !viewerElement) throw new Error("PDF reader container is unavailable.");

        localEventBus = new viewerModule.EventBus();
        eventBusRef.current = localEventBus;
        const linkService = new viewerModule.PDFLinkService({
          eventBus: localEventBus,
          externalLinkTarget: viewerModule.LinkTarget.NONE,
          externalLinkRel: "noopener noreferrer nofollow",
          ignoreDestinationZoom: false,
        });
        const findController = new viewerModule.PDFFindController({ eventBus: localEventBus, linkService });
        const pdfViewer = new viewerModule.PDFViewer({
          container,
          viewer: viewerElement,
          eventBus: localEventBus,
          linkService,
          findController,
          textLayerMode: 1,
          annotationMode: pdfjsLib.AnnotationMode.ENABLE,
          annotationEditorMode: pdfjsLib.AnnotationEditorType?.DISABLE ?? -1,
          enableScripting: false,
          enableHWA: true,
          maxCanvasPixels: MAX_CANVAS_PIXELS,
          maxCanvasDim: MAX_CANVAS_DIMENSION,
          removePageBorders: false,
        });
        linkService.setViewer(pdfViewer);
        pdfViewerRef.current = pdfViewer;
        linkServiceRef.current = linkService;
        findControllerRef.current = findController;

        on("pagesinit", () => {
          if (cancelled) return;
          const locator = loadPdfLocator(source.id);
          const initialFit = locator?.fit ?? "width";
          fitRef.current = initialFit;
          setFit(initialFit);
          if (initialFit === "page") pdfViewer.currentScaleValue = "page-fit";
          else if (initialFit === "custom" && locator?.scale) pdfViewer.currentScale = locator.scale;
          else pdfViewer.currentScaleValue = "page-width";
          if (locator) pdfViewer.currentPageNumber = clamp(locator.pageIndex + 1, 1, pdfViewer.pagesCount);
          requestAnimationFrame(() => requestAnimationFrame(() => {
            if (locator) {
              const pageView = pdfViewer._pages?.[locator.pageIndex];
              if (pageView?.div) container.scrollTop = pageView.div.offsetTop + locator.offset * pageView.div.clientHeight;
            }
            restoredRef.current = true;
            renderAllHighlights();
            setStatus("ready");
          }));
        });
        on("pagesloaded", (event) => setPageCount(event.pagesCount ?? pdfViewer.pagesCount));
        on("pagechanging", (event) => {
          setPageNumber(event.pageNumber);
          if (restoredRef.current) schedulePersist();
        });
        on("scalechanging", (event) => {
          setScale(event.scale ?? pdfViewer.currentScale ?? 1);
          requestAnimationFrame(renderAllHighlights);
          if (restoredRef.current) schedulePersist();
        });
        on("textlayerrendered", (event) => renderHighlightsForPage(Math.max(0, (event.pageNumber ?? 1) - 1)));
        const scheduleSupplementaryWork = (pdfDocument: any) => {
          if (supplementaryStarted || cancelled) return;
          supplementaryStarted = true;
          const run = () => {
            void (async () => {
              const rawOutline = await pdfDocument.getOutline().catch(() => null);
              if (cancelled) return;
              const normalizedOutline = Array.isArray(rawOutline) ? rawOutline : [];
              setOutline(normalizedOutline);
              setSidebarOpen(normalizedOutline.length > 0);
              const samples = await Promise.all(Array.from({ length: Math.min(3, pdfDocument.numPages) }, async (_, index) => {
                const page = await pdfDocument.getPage(index + 1);
                const content = await page.getTextContent({ disableNormalization: false });
                return content.items.some((item: any) => typeof item.str === "string" && item.str.trim());
              }));
              if (!cancelled) setNoSelectableText(samples.length > 0 && samples.every((value) => !value));
            })();
          };
          if ("requestIdleCallback" in window) {
            supplementaryIdleId = window.requestIdleCallback(run, { timeout: 1_500 });
          } else {
            supplementaryTimer = setTimeout(run, 0);
          }
        };

        on("pagerendered", (event) => {
          const page = event.pageNumber ?? event.source?.id;
          if (event.error && page) setPageFailures((current) => current.includes(page) ? current : [...current, page]);
          if (pdfDocumentRef.current) scheduleSupplementaryWork(pdfDocumentRef.current);
        });
        on("updatefindmatchescount", (event) => setSearchCount({
          current: event.matchesCount?.current ?? 0,
          total: event.matchesCount?.total ?? 0,
        }));
        on("updatefindcontrolstate", (event) => {
          setSearchPhase(event.state === viewerModule.FindState.PENDING ? "searching" : "done");
        });

        const range = createPdfBlobRangeTransport(pdfjsLib.PDFDataRangeTransport, source.file, source.file.name);
        const loadingTask = pdfjsLib.getDocument({
          range,
          rangeChunkSize: LOCAL_PDF_RANGE_CHUNK_BYTES,
          disableStream: true,
          disableAutoFetch: true,
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdfjs/standard_fonts/",
          wasmUrl: "/pdfjs/wasm/",
          isEvalSupported: false,
          enableXfa: false,
          disableFontFace: false,
          useSystemFonts: false,
          stopAtErrors: false,
        });
        loadingTaskRef.current = loadingTask;
        loadingTask.onPassword = (updatePassword: (password: string) => void, reason: number) => {
          passwordUpdateRef.current = updatePassword;
          setPasswordReason(reason === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD ? "incorrect" : "needed");
          setPassword("");
          setStatus("password");
        };
        const pdfDocument = await loadingTask.promise;
        if (cancelled) {
          await pdfDocument.destroy();
          return;
        }
        pdfDocumentRef.current = pdfDocument;
        setPageCount(pdfDocument.numPages);
        linkService.setDocument(pdfDocument, null);
        findController.setDocument(pdfDocument);
        pdfViewer.setDocument(pdfDocument);
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
        setFailure(failureFor(error));
        setStatus("error");
      }
    }

    void openPdf();
    return () => {
      cancelled = true;
      englishControllerRef.current?.abort();
      chineseControllerRef.current?.abort();
      chatControllerRef.current?.abort();
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      if (supplementaryIdleId !== null) window.cancelIdleCallback(supplementaryIdleId);
      if (supplementaryTimer) clearTimeout(supplementaryTimer);
      if (selectionCaptureTimerRef.current) clearTimeout(selectionCaptureTimerRef.current);
      if (restoredRef.current) persistPosition();
      for (const [name, handler] of listeners) localEventBus?._off?.(name, handler);
      pdfViewerRef.current?.cleanup?.();
      pdfViewerRef.current?.setDocument?.(null);
      linkServiceRef.current?.setDocument?.(null, null);
      loadingTaskRef.current?.destroy?.();
      pdfDocumentRef.current?.destroy?.();
      loadingTaskRef.current = null;
      pdfDocumentRef.current = null;
      pdfViewerRef.current = null;
      linkServiceRef.current = null;
      findControllerRef.current = null;
      eventBusRef.current = null;
    };
  }, [persistPosition, renderAllHighlights, renderHighlightsForPage, schedulePersist, source.file, source.id]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const onScroll = () => { if (restoredRef.current) schedulePersist(); };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [schedulePersist]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const controller = createPdfViewerResizeController({
      getContainer: () => scrollRef.current,
      getViewer: () => {
        const viewer = pdfViewerRef.current;
        return viewer?.pdfDocument ? viewer : null;
      },
      getFit: () => fitRef.current,
    });
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => controller.notify());
    const onWindowResize = () => controller.notify();
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target === container && event.propertyName === "left") controller.notify();
    };
    observer?.observe(container);
    window.addEventListener("resize", onWindowResize);
    container.addEventListener("transitionend", onTransitionEnd);
    controller.notify();
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", onWindowResize);
      container.removeEventListener("transitionend", onTransitionEnd);
      controller.dispose();
    };
  }, []);

  const requestEnglish = useCallback(async (snapshot: SelectionSnapshot, version: number) => {
    englishControllerRef.current?.abort();
    chineseControllerRef.current?.abort();
    chatControllerRef.current?.abort();
    const controller = new AbortController();
    englishControllerRef.current = controller;
    setAssistance({
      english: { phase: "loading", text: "", error: "" },
      chinese: { phase: "idle", text: "", error: "" },
    });
    try {
      const result = await requestSelectionAssistance({
        text: snapshot.text,
        context: snapshot.context,
        preset: profile.preset,
        mode: "english",
        monitor: "pdf",
        signal: controller.signal,
      });
      if (selectionVersionRef.current !== version) return;
      setAssistance({
        english: { phase: "success", text: result, error: "" },
        chinese: { phase: "idle", text: "", error: "" },
      });
    } catch (error) {
      if (controller.signal.aborted || selectionVersionRef.current !== version) return;
      setAssistance({
        english: { phase: "error", text: "", error: error instanceof Error ? error.message : "英文改写失败。" },
        chinese: { phase: "idle", text: "", error: "" },
      });
    }
  }, [profile.preset]);

  const captureSelection = useCallback((endpoint: SelectionAssistPoint | null = null) => {
    const container = scrollRef.current;
    const pdfViewer = pdfViewerRef.current;
    const domSelection = window.getSelection();
    if (!container || !pdfViewer || !domSelection || domSelection.isCollapsed || domSelection.rangeCount !== 1) return;
    const range = domSelection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;
    const text = domSelection.toString().replace(/\s+/g, " ").trim();
    if (!text || !/[A-Za-z]/.test(text)) return;
    const clientRects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0.5 && rect.height > 0.5);
    if (!clientRects.length) return;
    const pages = pdfViewer._pages ?? [];
    const pageIndexes = new Set<number>();
    const rectPages: Array<{ rect: DOMRect; index: number }> = [];
    for (const rect of clientRects) {
      const x = (rect.left + rect.right) / 2;
      const y = (rect.top + rect.bottom) / 2;
      const index = pages.findIndex((page: any) => {
        const bounds = page.div.getBoundingClientRect();
        return x >= bounds.left - 1 && x <= bounds.right + 1 && y >= bounds.top - 1 && y <= bounds.bottom + 1;
      });
      if (index >= 0) {
        pageIndexes.add(index);
        rectPages.push({ rect, index });
      }
    }
    if (pageIndexes.size !== 1) {
      closeSelection();
      setNotice("本次选择跨越了多个 PDF 页面；为避免生成错位高亮，Dawn 已取消该选择。请在单页内重新选择。");
      return;
    }
    const pageIndex = [...pageIndexes][0];
    const pageView = pages[pageIndex];
    const pageRect = pageView.div.getBoundingClientRect();
    const visibleBounds = intersectPdfBounds(currentPdfVisualBounds(), {
      left: pageRect.left,
      top: pageRect.top,
      right: pageRect.right,
      bottom: pageRect.bottom,
    });
    const direction = selectionAssistDirection(domSelection);
    const initialAnchor = selectionAssistAnchorFromRects(
      rectPages.filter(({ index }) => index === pageIndex).map(({ rect }) => rect),
      { direction, endpoint, visibleBounds },
    );
    if (!initialAnchor) {
      setNotice("无法稳定定位这段文字，请重新选择。未创建高亮。");
      return;
    }
    const located = initialAnchor.rects
      .map((rect) => ({ rect, quad: clientRectToPdfQuad(rect as DOMRect, pageRect, pageView.viewport) }))
      .filter((item): item is { rect: typeof initialAnchor.rects[number]; quad: PdfQuad } => Boolean(item.quad));
    if (!located.length) {
      setNotice("无法稳定定位这段文字，请重新选择。未创建高亮。");
      return;
    }
    const anchor = selectionAssistAnchorFromRects(located.map(({ rect }) => rect), {
      direction,
      endpoint,
      visibleBounds,
    });
    if (!anchor) return;
    const quads = located.map(({ quad }) => quad);
    const pageText = (pageView.div.querySelector(".textLayer")?.textContent ?? "").replace(/\s+/g, " ");
    const snapshot: SelectionSnapshot = {
      text,
      context: boundedSelectionContext(text, pageText),
      pageIndex,
      quads,
      anchor,
    };
    const version = ++selectionVersionRef.current;
    setSelection(snapshot);
    setActiveHighlight(null);
    setHighlightState({ phase: "idle", message: "" });
    setChatDraft("");
    setChatMessages([]);
    setChatState("idle");
    setChatError("");
    setChatSources([]);
    if (assistantMode === "rewrite") void requestEnglish(snapshot, version);
    else setAssistance(initialSelectionAssistanceState);
  }, [assistantMode, closeSelection, requestEnglish]);

  function pdfAssistBoundary(): SelectionAssistVisibleBounds {
    const visual = currentPdfVisualBounds();
    const scroll = scrollRef.current?.getBoundingClientRect();
    const toolbarBottom = document.querySelector<HTMLElement>(".dawn-pdf-toolbar")?.getBoundingClientRect().bottom
      ?? visual.top;
    const readerBounds = {
      left: scroll?.left ?? visual.left,
      top: Math.max(scroll?.top ?? visual.top, toolbarBottom + 8),
      right: scroll?.right ?? visual.right,
      bottom: scroll?.bottom ?? visual.bottom,
    };
    return intersectPdfBounds(visual, readerBounds);
  }

  function currentPdfSelectionAnchor(snapshot: SelectionSnapshot): SelectionAssistAnchor | null {
    const pageView = pdfViewerRef.current?._pages?.[snapshot.pageIndex];
    const pageRect = pageView?.div?.getBoundingClientRect?.();
    const viewport = pageView?.viewport;
    if (!pageRect || !viewport) return null;
    return selectionAssistAnchorFromPdfQuads({
      quads: snapshot.quads,
      viewport,
      pageRect,
      focusIndex: snapshot.anchor.focusIndex,
      direction: snapshot.anchor.direction,
      visibleBounds: pdfAssistBoundary(),
    });
  }

  function pdfAssistEventTargets() {
    return [scrollRef.current, viewerElementRef.current];
  }

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const scheduleCapture = (event: Event) => {
      if (selectionCaptureTimerRef.current) clearTimeout(selectionCaptureTimerRef.current);
      const pointer = event.type === "pointerup" ? event as PointerEvent : null;
      const endpoint = pointer ? { x: pointer.clientX, y: pointer.clientY } : null;
      selectionCaptureTimerRef.current = setTimeout(() => {
        selectionCaptureTimerRef.current = null;
        captureSelection(endpoint);
      }, 0);
    };
    container.addEventListener("pointerup", scheduleCapture);
    container.addEventListener("keyup", scheduleCapture);
    return () => {
      if (selectionCaptureTimerRef.current) clearTimeout(selectionCaptureTimerRef.current);
      selectionCaptureTimerRef.current = null;
      container.removeEventListener("pointerup", scheduleCapture);
      container.removeEventListener("keyup", scheduleCapture);
    };
  }, [captureSelection]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !selection && (sidebarOpen || searchOpen || appearanceOpen || activeHighlight)) {
        setSidebarOpen(false); setSearchOpen(false); setAppearanceOpen(false); setActiveHighlight(null);
      }
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (activeHighlight && !target?.closest(".dawn-pdf-highlight-delete") && !target?.closest(".dawn-pdf-highlight-mark")) setActiveHighlight(null);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [activeHighlight, appearanceOpen, searchOpen, selection, sidebarOpen]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>(".annotationLayer a[href]");
      if (!anchor) return;
      const href = anchor.href;
      if (!href || href.startsWith(`${window.location.href.split("#")[0]}#`) || anchor.dataset.internalLink) return;
      event.preventDefault();
      event.stopPropagation();
      const label = hostLabel(href);
      if (!isExternalNavigableLink(href)) {
        window.alert(`Dawn 已阻止不受支持的外部链接：${label}`);
        return;
      }
      if (!window.confirm(`即将打开外部网站：${label}\n\n是否继续？`)) return;
      const opened = window.open(href, "_blank", "noopener,noreferrer");
      if (opened) opened.opener = null;
    };
    container.addEventListener("click", onClick, true);
    return () => container.removeEventListener("click", onClick, true);
  }, []);

  const addHighlight = useCallback(() => {
    if (!selection) return;
    setHighlightState({ phase: "saving", message: "正在保存高亮…" });
    try {
      const highlight: PdfHighlight = {
        id: crypto.randomUUID(),
        pageIndex: selection.pageIndex,
        text: selection.text,
        quads: selection.quads,
        color: DAWN_YELLOW,
        createdAt: new Date().toISOString(),
      };
      const next = addPdfHighlight(source.id, highlight);
      setSidecar(next);
      setHighlightState({ phase: "saved", message: "高亮已保存在本机" });
      requestAnimationFrame(() => renderHighlightsForPage(selection.pageIndex));
    } catch (error) {
      setHighlightState({ phase: "error", message: error instanceof Error ? error.message : "高亮保存失败；英文和中文辅助仍可使用。" });
    }
  }, [renderHighlightsForPage, selection, source.id]);

  const requestChinese = useCallback(async () => {
    if (!selection || assistance.english.phase !== "success") return;
    chineseControllerRef.current?.abort();
    const controller = new AbortController();
    chineseControllerRef.current = controller;
    const version = selectionVersionRef.current;
    setAssistance((current) => ({ ...current, chinese: { phase: "loading", text: "", error: "" } }));
    try {
      const result = await requestSelectionAssistance({
        text: selection.text,
        context: selection.context,
        preset: profile.preset,
        mode: "chinese",
        signal: controller.signal,
      });
      if (selectionVersionRef.current !== version) return;
      setAssistance((current) => ({ ...current, chinese: { phase: "success", text: result, error: "" } }));
    } catch (error) {
      if (controller.signal.aborted || selectionVersionRef.current !== version) return;
      setAssistance((current) => ({
        ...current,
        chinese: { phase: "error", text: "", error: error instanceof Error ? error.message : "翻译失败，请重试。" },
      }));
    }
  }, [assistance.english.phase, profile.preset, selection]);

  const sendQuestion = useCallback(async (question: string, history = chatMessages) => {
    const trimmed = question.trim();
    if (!selection || !trimmed || chatState === "loading") return;
    const outgoing = [...history, { role: "user" as const, content: trimmed }];
    const version = selectionVersionRef.current;
    chatControllerRef.current?.abort();
    englishControllerRef.current?.abort();
    chineseControllerRef.current?.abort();
    const controller = new AbortController();
    chatControllerRef.current = controller;
    setChatMessages(outgoing);
    setChatDraft("");
    setChatState("loading");
    setChatError("");
    setChatSources([]);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: selection.text.slice(0, 2400),
          context: selection.context,
          bookTitle: source.title,
          messages: outgoing,
        }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null) as {
        answer?: string;
        error?: string;
        sources?: SelectionChatSource[];
      } | null;
      if (!response.ok || !data?.answer?.trim()) throw new Error(data?.error ?? "没有收到回答。");
      if (selectionVersionRef.current !== version) return;
      setChatMessages([...outgoing, { role: "assistant", content: data.answer.trim() }]);
      setChatSources(data.sources ?? []);
      setChatState("idle");
    } catch (error) {
      if (controller.signal.aborted || selectionVersionRef.current !== version) return;
      setChatError(error instanceof Error ? error.message : "对话失败，请稍后重试。");
      setChatState("error");
    }
  }, [chatMessages, chatState, selection, source.title]);

  const toggleAssistantMode = useCallback(() => {
    const next: BookAssistantMode = assistantMode === "rewrite" ? "ask" : "rewrite";
    setAssistantMode(next);
    saveBookAssistantMode(source.id, next);
    setAppearanceOpen(false);
    setSearchOpen(false);
    chatControllerRef.current?.abort();
    englishControllerRef.current?.abort();
    chineseControllerRef.current?.abort();
    setChatDraft("");
    setChatMessages([]);
    setChatState("idle");
    setChatError("");
    setChatSources([]);
    setAssistance(initialSelectionAssistanceState);
    if (next === "rewrite" && selection) void requestEnglish(selection, selectionVersionRef.current);
  }, [assistantMode, requestEnglish, selection, source.id]);

  const applyPageInput = useCallback(() => {
    const viewer = pdfViewerRef.current;
    if (!viewer) return;
    const parsed = Number.parseInt(pageInput, 10);
    const target = clamp(Number.isFinite(parsed) ? parsed : pageNumber, 1, Math.max(1, pageCount));
    viewer.currentPageNumber = target;
    setPageInput(String(target));
  }, [pageCount, pageInput, pageNumber]);

  const changePage = useCallback((delta: number) => {
    const viewer = pdfViewerRef.current;
    if (!viewer) return;
    viewer.currentPageNumber = clamp(viewer.currentPageNumber + delta, 1, Math.max(1, viewer.pagesCount));
  }, []);

  const setViewerFit = useCallback((next: "width" | "page") => {
    const viewer = pdfViewerRef.current;
    if (!viewer) return;
    fitRef.current = next;
    setFit(next);
    viewer.currentScaleValue = next === "width" ? "page-width" : "page-fit";
    schedulePersist();
  }, [schedulePersist]);

  const zoom = useCallback((factor: number) => {
    const viewer = pdfViewerRef.current;
    if (!viewer) return;
    const next = clamp((viewer.currentScale || 1) * factor, MIN_SCALE, MAX_SCALE);
    fitRef.current = "custom";
    scaleRef.current = next;
    setFit("custom");
    viewer.currentScale = next;
    setScale(next);
    schedulePersist();
  }, [schedulePersist]);

  const executeSearch = useCallback((query: string, again = false, backwards = false) => {
    const eventBus = eventBusRef.current;
    const normalizedQuery = query.trim();
    if (!eventBus || !normalizedQuery) return;
    if (!again) {
      lastSearchQueryRef.current = normalizedQuery;
      setSearchCount({ current: 0, total: 0 });
      setSearchPhase("searching");
    }
    eventBus.dispatch("find", {
      source: window,
      type: again ? "again" : "",
      query: normalizedQuery,
      phraseSearch: true,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious: backwards,
      matchDiacritics: false,
    });
  }, []);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!searchOpen) return;
    const normalizedQuery = searchQuery.trim();
    if (!normalizedQuery) {
      lastSearchQueryRef.current = "";
      setSearchCount({ current: 0, total: 0 });
      setSearchPhase("idle");
      eventBusRef.current?.dispatch("findbarclose", { source: window });
      return;
    }
    setSearchCount({ current: 0, total: 0 });
    setSearchPhase("searching");
    searchTimerRef.current = setTimeout(() => executeSearch(normalizedQuery), SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [executeSearch, searchOpen, searchQuery]);

  const closeSearch = useCallback(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setSearchOpen(false);
    eventBusRef.current?.dispatch("findbarclose", { source: window });
  }, []);

  const downloadOriginal = useCallback(() => {
    const url = URL.createObjectURL(source.file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = source.file.name;
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [source.file]);

  const deleteActiveHighlight = useCallback(() => {
    if (!activeHighlight) return;
    try {
      const next = removePdfHighlight(source.id, activeHighlight.id);
      setSidecar(next);
      setActiveHighlight(null);
      requestAnimationFrame(renderAllHighlights);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "删除高亮失败。");
    }
  }, [activeHighlight, renderAllHighlights, source.id]);

  const submitPassword = useCallback((event: FormEvent) => {
    event.preventDefault();
    if (!password || !passwordUpdateRef.current) return;
    const update = passwordUpdateRef.current;
    passwordUpdateRef.current = null;
    setStatus("loading");
    update(password);
  }, [password]);

  const renderOutline = useCallback((items: OutlineItem[], depth = 0): ReactNode => <ul className={`dawn-pdf-outline-level depth-${depth}`}>
    {items.map((item, index) => <li key={outlineKey(item, index)}>
      <button type="button" onClick={() => {
        if (item.dest) linkServiceRef.current?.goToDestination(item.dest);
        else if (item.url) {
          const label = hostLabel(item.url);
          if (isExternalNavigableLink(item.url) && window.confirm(`即将打开外部网站：${label}\n\n是否继续？`)) {
            const opened = window.open(item.url, "_blank", "noopener,noreferrer");
            if (opened) opened.opener = null;
          }
        }
      }}>{item.title || "未命名章节"}</button>
      {item.items?.length ? renderOutline(item.items, depth + 1) : null}
    </li>)}
  </ul>, []);

  const scaleLabel = fit === "custom" ? `${Math.round(scale * 100)}%` : fit === "width" ? "适合宽度" : "适合页面";
  const failurePagesLabel = useMemo(() => [...pageFailures].sort((a, b) => a - b).join("、"), [pageFailures]);
  const appearanceTone = pdfAppearanceTone(readerSettings.theme);

  return <main
    data-dawn-reading-surface="pdf"
    data-pdf-appearance={appearanceTone}
    className={`dawn-pdf-reader-shell reader-theme-${readerSettings.theme}`}
    style={{ "--pdf-page-filter": pdfAppearancePageFilter(readerSettings.theme) } as CSSProperties}
  >
    <header className="dawn-pdf-toolbar" aria-label="PDF 工具栏">
      <div className="dawn-pdf-toolbar-group dawn-pdf-toolbar-start">
        <button type="button" className="dawn-pdf-back" onClick={() => { persistPosition(); onClose(); }} aria-label="返回书架">
          <span aria-hidden="true">←</span><span>书架</span>
        </button>
        <button type="button" className="dawn-pdf-sidebar-toggle" aria-pressed={sidebarOpen} onClick={() => setSidebarOpen((open) => !open)}>目录</button>
      </div>

      <div className="dawn-pdf-toolbar-center">
        <strong className="dawn-pdf-toolbar-title" title={source.title}>{source.title}</strong>
        <div className="dawn-pdf-page-control" aria-label="PDF 页码">
          <button type="button" aria-label="上一页" disabled={pageNumber <= 1} onClick={() => changePage(-1)}>‹</button>
          <input
            aria-label="当前页"
            inputMode="numeric"
            value={pageInput}
            onChange={(event) => setPageInput(event.target.value.replace(/[^0-9]/g, ""))}
            onBlur={applyPageInput}
            onKeyDown={(event) => { if (event.key === "Enter") applyPageInput(); }}
          />
          <span aria-label={`共 ${pageCount || 0} 页`}>/ {pageCount || "—"}</span>
          <button type="button" aria-label="下一页" disabled={!pageCount || pageNumber >= pageCount} onClick={() => changePage(1)}>›</button>
        </div>
      </div>

      <div className="dawn-pdf-toolbar-group dawn-pdf-toolbar-end">
        <div className="dawn-pdf-zoom-group" aria-label="PDF 缩放">
          <button type="button" aria-label="缩小" disabled={scale <= MIN_SCALE && fit === "custom"} onClick={() => zoom(1 / 1.1)}>−</button>
          <button type="button" className="dawn-pdf-fit" title={scaleLabel} aria-label={`当前缩放：${scaleLabel}`} onClick={() => setViewerFit(fit === "width" ? "page" : "width")}>{fit === "page" ? "适合页面" : "适合宽度"}</button>
          <button type="button" aria-label="放大" disabled={scale >= MAX_SCALE && fit === "custom"} onClick={() => zoom(1.1)}>＋</button>
        </div>
        <AssistantModeToggle mode={assistantMode} onToggle={toggleAssistantMode} className="dawn-pdf-assistant-toggle" />
        <button
          ref={appearanceToggleRef}
          type="button"
          className="dawn-pdf-appearance-toggle"
          aria-label="PDF 阅读外观"
          aria-controls="pdf-appearance-panel"
          aria-expanded={appearanceOpen}
          onClick={() => {
            setSearchOpen(false);
            if (!appearanceOpen) syncAppearanceAnchor();
            setAppearanceOpen((open) => !open);
          }}
        >
          <span className="dawn-pdf-appearance-icon" aria-hidden="true" />
        </button>
        <button type="button" className="dawn-pdf-search-toggle" aria-pressed={searchOpen} disabled={noSelectableText} onClick={() => {
          setAppearanceOpen(false);
          setSearchOpen((open) => !open);
        }}>搜索</button>
        <button type="button" className="dawn-pdf-download" onClick={downloadOriginal}>下载原文件</button>
      </div>
    </header>

    {appearanceOpen && <div className="dawn-pdf-appearance-layer">
      <button
        type="button"
        className="dawn-pdf-appearance-backdrop"
        aria-label="关闭 PDF 阅读外观"
        onClick={() => setAppearanceOpen(false)}
      />
      <section
        id="pdf-appearance-panel"
        className="dawn-pdf-appearance-panel"
        style={appearanceAnchor ? {
          "--pdf-appearance-anchor-x": `${appearanceAnchor.x}px`,
          "--pdf-appearance-anchor-y": `${appearanceAnchor.y}px`,
        } as CSSProperties : undefined}
        role="dialog"
        aria-modal="true"
        aria-label="PDF 阅读外观"
        aria-description="暖纸和夜读只改变屏幕显示，不会修改 PDF 文件。"
      >
        <div className="dawn-pdf-appearance-row" role="group" aria-label="PDF 阅读外观">
          {PDF_APPEARANCE_OPTIONS.map(({ theme, label }) => <button
            type="button"
            className={`dawn-pdf-tone-dot tone-${pdfAppearanceTone(theme)}`}
            aria-label={label}
            aria-pressed={readerSettings.theme === theme}
            key={theme}
            onClick={() => updatePdfTheme(theme)}
          />)}
        </div>
      </section>
    </div>}

    {searchOpen && <section className="dawn-pdf-searchbar" role="search">
      <input
        autoFocus
        value={searchQuery}
        placeholder="搜索 PDF 文字"
        aria-label="搜索 PDF 文字"
        onChange={(event) => setSearchQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
            const normalizedQuery = searchQuery.trim();
            executeSearch(normalizedQuery, lastSearchQueryRef.current === normalizedQuery && searchCount.total > 0, event.shiftKey);
          }
          if (event.key === "Escape") closeSearch();
        }}
      />
      <span aria-live="polite">{pdfSearchStatusLabel(searchQuery, searchPhase, searchCount.current, searchCount.total)}</span>
      <button type="button" disabled={!searchCount.total} onClick={() => executeSearch(searchQuery, true, true)}>上一个</button>
      <button type="button" disabled={!searchCount.total} onClick={() => executeSearch(searchQuery, true, false)}>下一个</button>
      <button type="button" onClick={closeSearch} aria-label="关闭搜索">×</button>
    </section>}

    <div className={`dawn-pdf-reader-body ${sidebarOpen ? "sidebar-open" : ""}`}>
      {sidebarOpen && <aside className="dawn-pdf-sidebar" aria-label="PDF 目录">
        <h2>目录</h2>
        {outline.length ? renderOutline(outline) : <p>这个 PDF 没有可用的层级目录。</p>}
      </aside>}
      <div
        ref={scrollRef}
        className="dawn-pdf-scroll"
        tabIndex={-1}
        aria-label="PDF 页面"
      >
        <div ref={viewerElementRef} className="pdfViewer dawn-pdf-viewer" />
      </div>
    </div>

    {status === "loading" && <div className="dawn-pdf-state" role="status"><div className="dawn-pdf-spinner" /><h2>正在读取 PDF…</h2><p>页面会按可见区域逐步渲染。</p></div>}
    {status === "password" && <div className="dawn-pdf-state" role="dialog" aria-modal="true" aria-labelledby="pdf-password-title">
      <form onSubmit={submitPassword}>
        <h2 id="pdf-password-title">{passwordReason === "incorrect" ? "密码不正确" : "这个 PDF 需要密码"}</h2>
        <p>密码只用于本次本机打开，不会保存或上传。</p>
        <input autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} aria-label="PDF 密码" />
        <div><button type="button" onClick={onClose}>返回书架</button><button type="submit" disabled={!password}>打开</button></div>
      </form>
    </div>}
    {status === "error" && failure && <div className={`dawn-pdf-state error ${failure.kind}`} role="alert">
      <h2>{failure.title}</h2><p>{failure.detail}</p><div><button type="button" onClick={onClose}>返回书架</button></div>
    </div>}

    {status === "ready" && (notice || noSelectableText || pageFailures.length > 0) && <div className="dawn-pdf-notices" aria-live="polite">
      {notice && <p>{notice}<button type="button" onClick={() => setNotice("")} aria-label="关闭提示">×</button></p>}
      {noSelectableText && <p>未检测到可选择文字。这可能是扫描版 PDF；Dawn 不进行 OCR，页面仍会按原样显示。</p>}
      {pageFailures.length > 0 && <p>第 {failurePagesLabel} 页渲染失败；其他页面仍可阅读。可重新打开文件重试。</p>}
    </div>}

    {selection && <PdfSelectionCard
      anchor={selection.anchor}
      getAnchor={() => currentPdfSelectionAnchor(selection)}
      getBoundary={pdfAssistBoundary}
      getBoundaryElement={() => scrollRef.current}
      getEventTargets={pdfAssistEventTargets}
      returnFocus={() => scrollRef.current}
      layoutKey={`${selection.pageIndex}:${pageNumber}:${scale}:${fit}:${sidebarOpen ? 1 : 0}`}
      dragResetKey={selectionVersionRef.current}
      mode={assistantMode}
      state={assistance}
      chat={{
        draft: chatDraft,
        messages: chatMessages,
        state: chatState,
        error: chatError,
        sources: chatSources,
      }}
      highlightState={highlightState}
      onHighlight={addHighlight}
      onChinese={() => void requestChinese()}
      onRetryEnglish={() => void requestEnglish(selection, selectionVersionRef.current)}
      onChatDraftChange={setChatDraft}
      onChatSubmit={() => void sendQuestion(chatDraft)}
      onChatRetry={() => {
        const last = chatMessages.at(-1);
        if (last?.role === "user") void sendQuestion(last.content, chatMessages.slice(0, -1));
      }}
      onClose={closeSelection}
    />}

    {activeHighlight && <div className="dawn-pdf-highlight-delete" style={{ left: activeHighlight.left, top: activeHighlight.top }}>
      <button type="button" onClick={deleteActiveHighlight}>删除高亮</button>
    </div>}
  </main>;
}

export { deletePdfHighlightSidecar };
