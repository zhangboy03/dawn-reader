import type { BookAssistantMode } from "../lib/bookAssistantMode";

const modeCopy: Record<BookAssistantMode, { current: string; next: string; mark: string }> = {
  rewrite: { current: "英文改写", next: "AI 提问", mark: "英" },
  ask: { current: "AI 提问", next: "英文改写", mark: "问" },
};

export function AssistantModeToggle({ mode, onToggle, className = "" }: {
  mode: BookAssistantMode;
  onToggle: () => void;
  className?: string;
}) {
  const copy = modeCopy[mode];
  const label = `划线后：${copy.current}。点击切换：${copy.next}`;
  return <button
    type="button"
    className={`assistant-mode-toggle ${className}`.trim()}
    data-mode={mode}
    aria-label={label}
    title={label}
    onClick={onToggle}
  >
    <span aria-hidden="true">{copy.mark}</span>
  </button>;
}
