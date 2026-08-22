import type { SelectionAssistAnchor, SelectionAssistVisibleBounds } from "../../lib/selectionAssistAnchor";
import { canRequestChinese, type SelectionAssistanceState } from "../../lib/selectionAssistance";
import { SelectionAssistSurface } from "../selection-assist/SelectionAssistSurface";

export type SelectionCardAnchor = SelectionAssistAnchor;

export function PdfSelectionCard({
  anchor,
  getAnchor,
  getBoundary,
  getEventTargets,
  getBoundaryElement,
  returnFocus,
  state,
  highlightState,
  onHighlight,
  onChinese,
  onRetryEnglish,
  onClose,
  layoutKey = 0,
  dragResetKey = 0,
}: {
  anchor: SelectionCardAnchor;
  getAnchor?: () => SelectionAssistAnchor | null;
  getBoundary?: () => SelectionAssistVisibleBounds | null;
  getEventTargets?: () => Array<EventTarget | null | undefined>;
  getBoundaryElement?: () => Element | null;
  returnFocus?: () => HTMLElement | null;
  state: SelectionAssistanceState;
  highlightState: { phase: "idle" | "saving" | "saved" | "error"; message: string };
  onHighlight: () => void;
  onChinese: () => void;
  onRetryEnglish: () => void;
  onClose: () => void;
  layoutKey?: string | number;
  dragResetKey?: string | number;
}) {
  const showChinese = state.english.phase === "success" || state.chinese.phase !== "idle";
  const error = state.english.phase === "error" || state.chinese.phase === "error" || highlightState.phase === "error";
  const contentLayoutKey = [
    layoutKey,
    state.english.phase,
    state.english.text.length,
    state.english.error.length,
    state.chinese.phase,
    state.chinese.text.length,
    state.chinese.error.length,
    highlightState.phase,
    highlightState.message.length,
  ].join(":");

  return <SelectionAssistSurface
    title="简明英文"
    ariaLabel="所选文字辅助"
    className={`pdf-selection-assist ${error ? "is-error" : ""}`}
    actions={<>
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
    </>}
    onDismiss={onClose}
    getAnchor={getAnchor ?? (() => anchor)}
    getBoundary={getBoundary}
    getEventTargets={getEventTargets}
    getBoundaryElement={getBoundaryElement}
    returnFocus={returnFocus}
    layoutKey={contentLayoutKey}
    dragResetKey={dragResetKey}
    maximumHeight={560}
    minimumUsefulHeight={184}
  >
    <div aria-live="polite">
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
  </SelectionAssistSurface>;
}
