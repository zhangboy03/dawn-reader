import type { SelectionAssistAnchor, SelectionAssistVisibleBounds } from "../../lib/selectionAssistAnchor";
import { canRequestChinese, type SelectionAssistanceState } from "../../lib/selectionAssistance";
import type { BookAssistantMode } from "../../lib/bookAssistantMode";
import { AssistantModeToggle } from "../AssistantModeToggle";
import { SelectionAssistSurface } from "../selection-assist/SelectionAssistSurface";
import {
  SelectionChatBody,
  SelectionChatComposer,
  type SelectionChatMessage,
  type SelectionChatState,
} from "../selection-assist/SelectionChat";

export type SelectionCardAnchor = SelectionAssistAnchor;

export function PdfSelectionCard({
  anchor,
  getAnchor,
  getBoundary,
  getEventTargets,
  getBoundaryElement,
  returnFocus,
  mode,
  state,
  chat,
  highlightState,
  onHighlight,
  onChinese,
  onRetryEnglish,
  onModeToggle,
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
  mode: BookAssistantMode;
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
  onModeToggle: () => void;
  onChatDraftChange: (value: string) => void;
  onChatSubmit: () => void;
  onChatRetry: () => void;
  onClose: () => void;
  layoutKey?: string | number;
  dragResetKey?: string | number;
}) {
  const showChinese = mode === "rewrite" && (state.english.phase === "success" || state.chinese.phase !== "idle");
  const error = mode === "rewrite"
    ? state.english.phase === "error" || state.chinese.phase === "error" || highlightState.phase === "error"
    : chat.state === "error" || highlightState.phase === "error";
  const contentLayoutKey = [
    layoutKey,
    mode,
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
    title={mode === "ask" ? "AI 提问" : "简明英文"}
    ariaLabel={mode === "ask" ? "AI 提问" : "所选文字辅助"}
    className={`pdf-selection-assist ${mode === "ask" ? "ask-mode" : "rewrite-mode"} ${error ? "is-error" : ""}`}
    actions={<>
      <AssistantModeToggle mode={mode} onToggle={onModeToggle} className="selection-assist-mode-toggle" autoFocusTarget />
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
    minimumUsefulHeight={mode === "ask" ? 156 : 184}
    footer={mode === "ask" ? <SelectionChatComposer
      draft={chat.draft}
      messages={chat.messages}
      state={chat.state}
      onDraftChange={onChatDraftChange}
      onSubmit={onChatSubmit}
    /> : undefined}
  >
    {mode === "rewrite" ? <div aria-live="polite">
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
    </div> : <div>
      <SelectionChatBody
        messages={chat.messages}
        state={chat.state}
        error={chat.error}
        onRetry={onChatRetry}
      />
      {highlightState.message && <p className={`pdf-selection-feedback ${highlightState.phase}`}>{highlightState.message}</p>}
    </div>}
  </SelectionAssistSurface>;
}
