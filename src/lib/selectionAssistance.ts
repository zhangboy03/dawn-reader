import { saveAiPerformanceEvent, selectionLengthBucket } from "./aiPerformance";
import { selectionKind } from "./selectionKind";

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

export function serverTimingDuration(header: string | null, name: string) {
  if (!header) return null;
  for (const entry of header.split(",")) {
    const [metric, ...parameters] = entry.trim().split(";");
    if (metric !== name) continue;
    const duration = parameters.find((parameter) => parameter.trim().startsWith("dur="));
    if (!duration) return null;
    const value = Number.parseFloat(duration.trim().slice(4));
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

export function cloudflareColo(cfRay: string | null) {
  return cfRay?.match(/-([A-Z]{3})$/)?.[1] ?? null;
}

function errorClassForStatus(status: number) {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server_5xx";
  return status >= 400 ? "request_error" : "invalid_output";
}

function numericHeader(headers: Headers, name: string) {
  const value = Number.parseInt(headers.get(name) ?? "", 10);
  return Number.isFinite(value) ? value : null;
}

export async function requestSelectionAssistance({
  text,
  context,
  preset,
  mode,
  monitor,
  signal,
}: {
  text: string;
  context: SelectionContext;
  preset: string;
  mode: "english" | "chinese";
  monitor?: "pdf";
  signal?: AbortSignal;
}) {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  let response: Response;
  try {
    response = await fetch("/api/rewrite", {
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
  } catch (error) {
    if (signal?.aborted) throw error;
    if (monitor === "pdf" && mode === "english") {
      void saveAiPerformanceEvent({
        attempts: 1,
        cfColo: null,
        clientTotalMs: performance.now() - started,
        errorClass: "network_error",
        id: crypto.randomUUID(),
        inputTokens: null,
        mode: "english",
        model: null,
        outputTokens: null,
        platform: "web",
        provider: null,
        providerMs: null,
        schemaVersion: 1,
        selectionKind: selectionKind(text),
        selectionLength: selectionLengthBucket(text),
        startedAt,
        success: false,
        surface: "pdf",
        workerMs: null,
      }).catch(() => undefined);
    }
    throw error;
  }
  const body = await response.json().catch(() => null) as { result?: string; rewrite?: string; error?: string } | null;
  const result = body?.result ?? body?.rewrite;
  const providerHeader = response.headers.get("X-AI-Provider");
  const providerParts = providerHeader?.split("|").map((part) => part.trim()) ?? [];
  const success = response.ok && Boolean(result?.trim());
  if (monitor === "pdf" && mode === "english") {
    void saveAiPerformanceEvent({
      attempts: numericHeader(response.headers, "X-AI-Attempts") ?? 1,
      cfColo: cloudflareColo(response.headers.get("cf-ray")),
      clientTotalMs: performance.now() - started,
      errorClass: success
        ? null
        : response.headers.get("X-AI-Error-Class") ?? errorClassForStatus(response.status),
      id: crypto.randomUUID(),
      inputTokens: numericHeader(response.headers, "X-AI-Input-Tokens"),
      mode: "english",
      model: response.headers.get("X-AI-Model") ?? providerParts[1] ?? null,
      outputTokens: numericHeader(response.headers, "X-AI-Output-Tokens"),
      platform: "web",
      provider: providerParts[0] ?? null,
      providerMs: serverTimingDuration(response.headers.get("Server-Timing"), "ai-provider"),
      schemaVersion: 1,
      selectionKind: selectionKind(text),
      selectionLength: selectionLengthBucket(text),
      startedAt,
      success,
      surface: "pdf",
      workerMs: serverTimingDuration(response.headers.get("Server-Timing"), "ai-worker"),
    }).catch(() => undefined);
  }
  if (!response.ok || !result?.trim()) throw new Error(body?.error ?? "AI 请求失败，请重试。");
  return result.trim();
}
