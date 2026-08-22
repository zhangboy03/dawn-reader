import type { BookAssistantMode } from "../lib/bookAssistantMode";

export function AssistantModeToggle({ mode, onChange, autoFocusTarget = false }: {
  mode: BookAssistantMode;
  onChange: (mode: BookAssistantMode) => void;
  autoFocusTarget?: boolean;
}) {
  return <div className="assistant-mode-switch" role="group" aria-label="划线辅助方式">
    {(["rewrite", "ask"] as const).map((value) => <button
      type="button"
      data-mode={value}
      aria-pressed={mode === value}
      aria-label={value === "rewrite" ? "划线后使用英文改写" : "划线后使用 AI 提问"}
      data-selection-assist-autofocus={autoFocusTarget && mode === value || undefined}
      onClick={() => onChange(value)}
      key={value}
    >{value === "rewrite" ? "改写" : "提问"}</button>)}
  </div>;
}
