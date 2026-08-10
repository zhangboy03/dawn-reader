import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { BookSource } from "./Library";
import type { ReaderProfile } from "../lib/storage";
import {
  loadReaderSettings,
  saveReaderSettings,
  type PencilMode,
  type ReaderSettings,
} from "../lib/readerSettings";
import { contextFromParagraphs, type RewriteContext } from "../lib/rewriteContext";
import { parseReadingPosition, saveReadingPosition } from "../lib/readingPosition";
import { loadCloudProgress, saveCloudProgress, saveCloudState } from "../lib/cloudSync";
import { nextPencilMode, pageTurnFromPointer } from "../lib/pencilInput";

type RewriteState = "idle" | "loading" | "complete" | "error";
type SelectionAnchor = { x: number; y: number; placement: "above" | "below" };

const themeColors = {
  paper: { background: "#f4f6f3", color: "#182126" },
  sepia: { background: "#ece3d1", color: "#332c25" },
  night: { background: "#15212c", color: "#dbe3e4" },
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
  const rewriteAbortRef = useRef<AbortController | null>(null);
  const reflowTimerRef = useRef<number | null>(null);
  const cloudProgressTimerRef = useRef<number | null>(null);
  const pendingCloudProgressRef = useRef<ReturnType<typeof saveReadingPosition> | null>(null);
  const pencilModeRef = useRef(loadReaderSettings().pencilMode);
  const lastPointerTypeRef = useRef("");
  const pointerStartRef = useRef<{ x: number; type: string } | null>(null);
  const lastPencilControlTapRef = useRef(0);
  const [displayTitle, setDisplayTitle] = useState(source.title);
  const [selected, setSelected] = useState("");
  const [selectionAnchor, setSelectionAnchor] = useState<SelectionAnchor | null>(null);
  const [rewrite, setRewrite] = useState("");
  const [rewriteState, setRewriteState] = useState<RewriteState>("idle");
  const [pageProgress, setPageProgress] = useState(0);
  const [locationsReady, setLocationsReady] = useState(false);
  const [settings, setSettings] = useState<ReaderSettings>(loadReaderSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const textParagraphs = source.type === "text" ? source.text.split(/\n\s*\n/).filter(Boolean) : [];

  function updateSettings(patch: Partial<ReaderSettings>) {
    setSettings((current) => {
      const next = { ...current, ...patch };
      pencilModeRef.current = next.pencilMode;
      saveReaderSettings(next);
      void saveCloudState({ settings: next }).catch(() => undefined);
      return next;
    });
  }

  function setPencilMode(mode: PencilMode) {
    updateSettings({ pencilMode: mode });
    clearSelection();
  }

  function togglePencilMode() {
    setPencilMode(nextPencilMode(pencilModeRef.current));
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

  async function requestRewrite(text: string, context: RewriteContext) {
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
    setSelected(text);
    setSelectionAnchor(anchor);
    void requestRewrite(text, context);
  }

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
    const progressKey = `dawn-reader-progress:${source.id ?? source.file.name}`;
    let canPersistProgress = false;
    let locationsGenerated = false;
    source.file.arrayBuffer().then(async (buffer) => {
      if (cancelled || !epubRef.current) return;
      const localPosition = parseReadingPosition(localStorage.getItem(progressKey));
      const cloudPosition = source.id
        ? await loadCloudProgress(source.id).catch(() => null)
        : null;
      const cloudIsNewer = Boolean(cloudPosition && (
        !localPosition
        || !localPosition.updatedAt
        || Boolean(cloudPosition.updatedAt && cloudPosition.updatedAt >= localPosition.updatedAt)
      ));
      const savedPosition = cloudIsNewer ? cloudPosition : localPosition;
      if (savedPosition) saveReadingPosition(progressKey, savedPosition);
      if (source.id && localPosition && !cloudIsNewer) {
        void saveCloudProgress(source.id, localPosition).catch(() => undefined);
      }
      const { default: ePub } = await import("epubjs");
      book = ePub(buffer);
      bookRef.current = book;
      book.loaded.metadata.then((metadata: { title?: string }) => {
        if (metadata.title) setDisplayTitle(metadata.title.trim());
      }).catch(() => undefined);
      const rendition = book.renderTo(epubRef.current, {
        width: "100%",
        height: "100%",
        flow: "paginated",
        spread: "auto",
        minSpreadWidth: 900,
      });
      renditionRef.current = rendition;
      applyEpubTheme(rendition);
      rendition.hooks.content.register((contents: any) => {
        const document = contents.document as Document;
        document.addEventListener("pointerdown", (event: PointerEvent) => {
          lastPointerTypeRef.current = event.pointerType;
          pointerStartRef.current = { x: event.clientX, type: event.pointerType };
          clearSelection();
          if (event.pointerType === "pen" && event.button === 2) {
            event.preventDefault();
            togglePencilMode();
            pointerStartRef.current = null;
          } else if (event.pointerType === "pen" && pencilModeRef.current === "page") {
            event.preventDefault();
          }
        });
        document.addEventListener("pointerup", (event: PointerEvent) => {
          const start = pointerStartRef.current;
          pointerStartRef.current = null;
          const pagesWithTouch = event.pointerType === "touch";
          const pagesWithPencil = event.pointerType === "pen" && pencilModeRef.current === "page";
          if (!start || start.type !== event.pointerType || (!pagesWithTouch && !pagesWithPencil)) return;
          event.preventDefault();
          turnPage(pageTurnFromPointer(start.x, event.clientX, contents.window.innerWidth));
        });
      });
      rendition.on("selected", (cfiRange: string, contents: any) => {
        const selection = contents.window.getSelection() as Selection | null;
        const text = selection?.toString().trim();
        if (!text || !selection?.rangeCount) return;
        const pointerType = lastPointerTypeRef.current;
        if (pointerType === "touch" || (pointerType === "pen" && pencilModeRef.current === "page")) {
          selection.removeAllRanges();
          return;
        }
        if (selectedCfiRef.current) {
          try { rendition.annotations.remove(selectedCfiRef.current, "highlight"); } catch { /* no-op */ }
        }
        selectedCfiRef.current = cfiRange;
        selectedContentsRef.current = contents;
        try {
          rendition.annotations.highlight(cfiRange, {}, undefined, "dawn-selection", {
            fill: "#e78349",
            "fill-opacity": "0.24",
            "mix-blend-mode": "multiply",
          });
        } catch { /* browser selection remains as fallback */ }
        const rect = selection.getRangeAt(0).getBoundingClientRect();
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
      });
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
    });
    return () => {
      cancelled = true;
      if (reflowTimerRef.current) window.clearTimeout(reflowTimerRef.current);
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
    rewriteAbortRef.current?.abort();
    rewriteAbortRef.current = null;
    window.getSelection()?.removeAllRanges();
    selectedContentsRef.current?.window?.getSelection()?.removeAllRanges();
    if (selectedCfiRef.current) {
      try { renditionRef.current?.annotations.remove(selectedCfiRef.current, "highlight"); } catch { /* no-op */ }
    }
    selectedCfiRef.current = null;
    selectedContentsRef.current = null;
    setSelected("");
    setSelectionAnchor(null);
    setRewrite("");
    setRewriteState("idle");
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

  function handleShellPointerDown(event: ReactPointerEvent) {
    lastPointerTypeRef.current = event.pointerType;
    if (event.pointerType === "pen" && event.button === 2) {
      event.preventDefault();
      togglePencilMode();
      return;
    }
    clearSelection();
  }

  function handlePencilControlPointerUp(event: ReactPointerEvent) {
    if (event.pointerType !== "pen" || (event.target as Element).closest("button")) return;
    const now = performance.now();
    if (now - lastPencilControlTapRef.current < 360) {
      event.preventDefault();
      togglePencilMode();
      lastPencilControlTapRef.current = 0;
    } else {
      lastPencilControlTapRef.current = now;
    }
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

  return <div className={`reader-shell reader-theme-${settings.theme}`} onPointerDown={handleShellPointerDown}>
    <header className="reader-topbar">
      <button className="back-button" onClick={onClose}>← <span>书架</span></button>
      <div className="reader-title"><strong>{displayTitle}</strong>{source.type === "epub" && <small>{pageProgress}%</small>}</div>
      <div className="reader-actions">
        {source.type === "epub" && <div className="pencil-switch" role="group" aria-label="Apple Pencil 模式" onPointerUp={handlePencilControlPointerUp}>
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

    <main className="reading-stage" style={paperStyle}>
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
      role="status"
      aria-live="polite"
    >
      <header>简明英文</header>
      {rewrite ? <p>{rewrite}</p> : <div className="rewrite-wait"><i /><span>正在改写…</span></div>}
    </aside>}
  </div>;
}
