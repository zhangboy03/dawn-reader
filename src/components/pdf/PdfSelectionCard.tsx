import type { SelectionAssistAnchor, SelectionAssistVisibleBounds } from "../../lib/selectionAssistAnchor";
import { canRequestChinese, type SelectionAssistanceState } from "../../lib/selectionAssistance";
import { SelectionAssistSurface } from "../selection-assist/SelectionAssistSurface";
import {
  SelectionChatBody,
  SelectionChatComposer,
  type SelectionChatMessage,
  type SelectionChatState,
} from "../selection-assist/SelectionChat";

export type SelectionCardAnchor = SelectionAssistAnchor;
export type PdfSelectionAssistRoute = "rewrite" | "ask";

export function PdfSelectionCard({
  anchor,
  getAnchor,
  getBoundary,
  getEventTargets,
  getBoundaryElement,
  returnFocus,
  route,
  state,
  chat,
  highlightState,
  onHighlight,
  onChinese,
  onRetryEnglish,
  onEnterAsk,
  onReturnToRewrite,
  onChatDraftChange,
  onChatSubmit,
  onChatRetry,
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
  route: PdfSelectionAssistRoute;
  state: SelectionAssistanceState;
  chat: {
    draft: string;
    messages: SelectionChatMessage[];
    state: SelectionChatState;
    error: string;
  };
  highlightState: { phase: "idle" | "saving" | "saved" | "error"; message: string };
  onHighlight: () => void;
  onChinese: () => void;
  onRetryEnglish: () => void;
  onEnterAsk: () => void;
  onReturnToRewrite: () => void;
  onChatDraftChange: (value: string) => void;
  onChatSubmit: () => void;
  onChatRetry: () => void;
  onClose: () => void;
  layoutKey?: string | number;
  dragResetKey?: string | number;
}) {
  const showChinese = route === "rewrite" && (state.english.phase === "success" || state.chinese.phase !== "idle");
  const error = route === "rewrite"
    ? state.english.phase === "error" || state.chinese.phase === "error" || highlightState.phase === "error"
    : chat.state === "error" || highlightState.phase === "error";
  const contentLayoutKey = [
    layoutKey,
    route,
    state.english.phase,
    state.english.text.length,
    state.english.error.length,
    state.chinese.phase,
    state.chinese.text.length,
    state.chinese.error.length,
    highlightState.phase,
    highlightState.message.length,
    chat.state,
    chat.messages.length,
    chat.messages.reduce((total, message) => total + message.content.length, 0),
    chat.messages.reduce((total, message) => total + (message.sources?.length ?? 0), 0),
    chat.draft.length,
  ].join(":");

  return <SelectionAssistSurface
    title={route === "ask" ? "问这段" : "简明英文"}
    ariaLabel={route === "ask" ? "问这段" : "简明英文"}
    className={`pdf-selection-assist ${route === "ask" ? "ask-route" : "rewrite-route"} ${error ? "is-error" : ""}`}
    leadingAction={route === "ask" ? <button
      type="button"
      className="selection-assist-back"
      onClick={onReturnToRewrite}
      aria-label="返回简明英文"
    >← <span>简明英文</span></button> : undefined}
    actions={route === "rewrite" ? <>
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
    </> : undefined}
    onDismiss={onClose}
    onEscape={route === "ask" ? () => { onReturnToRewrite(); return true; } : undefined}
    closeLabel="关闭本次辅助"
    getAnchor={getAnchor ?? (() => anchor)}
    getBoundary={getBoundary}
    getEventTargets={getEventTargets}
    getBoundaryElement={getBoundaryElement}
    returnFocus={returnFocus}
    layoutKey={contentLayoutKey}
    dragResetKey={dragResetKey}
    maximumHeight={560}
    minimumUsefulHeight={route === "ask" ? 156 : 184}
    bodyEmpty={route === "ask" && chat.messages.length === 0 && chat.state !== "error"}
    footer={route === "ask" ? <SelectionChatComposer
      draft={chat.draft}
      messages={chat.messages}
      state={chat.state}
      onDraftChange={onChatDraftChange}
      onSubmit={onChatSubmit}
      focusOnMount
    /> : undefined}
  >
    {route === "rewrite" ? <div aria-live="polite">
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
      {(state.english.phase === "success" || state.english.phase === "error") && <button
        type="button"
        className="selection-assist-escalation"
        onClick={onEnterAsk}
        aria-label={chat.messages.length ? "继续向 AI 问原文所选内容" : "向 AI 问原文所选内容"}
      >{chat.messages.length ? "继续提问" : "问这段"}</button>}
    </div> : <div>
      <SelectionChatBody
        messages={chat.messages}
        state={chat.state}
        error={chat.error}
        onRetry={onChatRetry}
      />
    </div>}
  </SelectionAssistSurface>;
}
