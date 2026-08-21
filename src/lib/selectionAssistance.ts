export type AssistancePhase = "idle" | "loading" | "success" | "error";
export type SelectionAssistanceState = {
  english: { phase: AssistancePhase; text: string; error: string };
  chinese: { phase: AssistancePhase; text: string; error: string };
};

export type SelectionContext = {
  before: string;
  after: string;
};

export const initialSelectionAssistanceState: SelectionAssistanceState = {
  english: { phase: "idle", text: "", error: "" },
  chinese: { phase: "idle", text: "", error: "" },
};

export function canRequestChinese(state: SelectionAssistanceState) {
  return state.english.phase === "success" && state.chinese.phase !== "loading";
}

export function boundedSelectionContext(selected: string, pageText: string, radius = 700): SelectionContext {
  const cleanSelection = selected.replace(/\s+/g, " ").trim();
  const cleanPage = pageText.replace(/\s+/g, " ").trim();
  if (!cleanSelection || !cleanPage) return { before: "", after: "" };
  const index = cleanPage.toLocaleLowerCase().indexOf(cleanSelection.toLocaleLowerCase());
  if (index < 0) return { before: "", after: "" };
  return {
    before: cleanPage.slice(Math.max(0, index - radius), index),
    after: cleanPage.slice(index + cleanSelection.length, index + cleanSelection.length + radius),
  };
}

export async function requestSelectionAssistance({
  text,
  context,
  preset,
  mode,
  signal,
}: {
  text: string;
  context: SelectionContext;
  preset: string;
  mode: "english" | "chinese";
  signal?: AbortSignal;
}) {
  const response = await fetch("/api/rewrite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      text: text.slice(0, 1200),
      context: {
        before: context.before.slice(-700),
        after: context.after.slice(0, 700),
      },
      preset,
      mode,
    }),
  });
  const body = await response.json().catch(() => null) as { result?: string; rewrite?: string; error?: string } | null;
  const result = body?.result ?? body?.rewrite;
  if (!response.ok || !result?.trim()) throw new Error(body?.error ?? "AI 请求失败，请重试。");
  return result.trim();
}
