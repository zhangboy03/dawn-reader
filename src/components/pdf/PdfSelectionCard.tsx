import { useEffect, useRef } from "react";
import { canRequestChinese, type SelectionAssistanceState } from "../../lib/selectionAssistance";

export type SelectionCardAnchor = { left: number; right: number; top: number; bottom: number };

export function PdfSelectionCard({
  anchor,
  state,
  highlightState,
  onHighlight,
  onChinese,
  onRetryEnglish,
  onClose,
}: {
  anchor: SelectionCardAnchor;
  state: SelectionAssistanceState;
  highlightState: { phase: "idle" | "saving" | "saved" | "error"; message: string };
  onHighlight: () => void;
  onChinese: () => void;
  onRetryEnglish: () => void;
  onClose: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportWidth = viewport?.width ?? window.innerWidth;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const margin = 12;
    const gap = 10;
    const bounds = card.getBoundingClientRect();
    const preferredLeft = (anchor.left + anchor.right - bounds.width) / 2;
    const left = Math.max(viewportLeft + margin, Math.min(preferredLeft, viewportLeft + viewportWidth - bounds.width - margin));
    const above = anchor.top - bounds.height - gap;
    const below = anchor.bottom + gap;
    const top = above >= viewportTop + 66 + margin
      ? above
      : Math.min(below, viewportTop + viewportHeight - bounds.height - margin);
    card.style.left = `${left}px`;
    card.style.top = `${Math.max(viewportTop + 66 + margin, top)}px`;
  }, [anchor, state, highlightState]);

  const showChinese = state.english.phase === "success" || state.chinese.phase !== "idle";
  return <div
    ref={cardRef}
    className="pdf-selection-card"
    role="dialog"
    aria-label="所选文字辅助"
    style={{ left: anchor.left, top: anchor.bottom + 10 }}
    onPointerDown={(event) => event.stopPropagation()}
  >
    <div className="pdf-selection-card-header">
      <strong>简明英文</strong>
      <div className="pdf-selection-card-actions">
        <button
          type="button"
          className={`pdf-highlight-action ${highlightState.phase === "saved" ? "is-saved" : ""}`}
          disabled={highlightState.phase === "saving"}
          onClick={onHighlight}
          aria-label="用黄色标记所选文字"
          title="黄色标记"
        ><span aria-hidden="true" /></button>
        {showChinese && <button
          type="button"
          className="pdf-selection-chinese-action"
          disabled={!canRequestChinese(state)}
          onClick={onChinese}
          aria-label="中文"
        >{state.chinese.phase === "loading" ? "中文生成中…" : "中文"}</button>}
        <button type="button" className="pdf-selection-close" onClick={onClose} aria-label="关闭解释">×</button>
      </div>
    </div>

    <div className="pdf-selection-card-body" aria-live="polite">
      {state.english.phase === "idle" && <p className="pdf-selection-loading">正在读取所选内容…</p>}
      {state.english.phase === "loading" && <p className="pdf-selection-loading">正在生成简明英文…</p>}
      {state.english.phase === "success" && <p className="pdf-selection-result">{state.english.text}</p>}
      {state.english.phase === "error" && <div className="pdf-selection-error">
        <p>{state.english.error || "英文解释暂时失败。"}</p>
        <button type="button" className="pdf-selection-retry" onClick={onRetryEnglish}>重试英文</button>
      </div>}

      {state.chinese.phase === "loading" && <p className="pdf-selection-loading pdf-selection-chinese">正在生成中文…</p>}
      {state.chinese.phase === "success" && <section className="pdf-selection-chinese" lang="zh-CN">
        <strong>中文</strong><p>{state.chinese.text}</p>
      </section>}
      {state.chinese.phase === "error" && <section className="pdf-selection-chinese pdf-selection-error" lang="zh-CN">
        <p>{state.chinese.error || "中文解释暂时失败。"}</p>
        <button type="button" className="pdf-selection-translation-retry" onClick={onChinese}>重试中文</button>
      </section>}

      {highlightState.message && <p className={`pdf-selection-feedback ${highlightState.phase}`}>{highlightState.message}</p>}
    </div>
  </div>;
}
