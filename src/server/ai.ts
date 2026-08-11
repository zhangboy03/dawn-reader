import { env } from "cloudflare:workers";
import { selectionPrompt, type AssistanceMode } from "./aiPrompt";

type AiConfig = {
  provider: string;
  baseUrl: string;
  key: string;
  model: string;
};

type RuntimeEnv = {
  AI_PROVIDER?: string;
  AI_BASE_URL?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
};

export type RewriteInput = {
  text?: string;
  context?: { before?: string; after?: string };
  bookTitle?: string;
  preset?: string;
  mode?: AssistanceMode;
};

function runtimeEnv(): RuntimeEnv {
  const workerEnv = env as unknown as RuntimeEnv;
  const requestEnv = globalThis.__DAWN_READER_ENV__ as RuntimeEnv | undefined;
  return {
    AI_PROVIDER: requestEnv?.AI_PROVIDER ?? workerEnv.AI_PROVIDER ?? process.env.AI_PROVIDER,
    AI_BASE_URL: requestEnv?.AI_BASE_URL ?? workerEnv.AI_BASE_URL ?? process.env.AI_BASE_URL,
    AI_API_KEY: requestEnv?.AI_API_KEY ?? workerEnv.AI_API_KEY ?? process.env.AI_API_KEY,
    AI_MODEL: requestEnv?.AI_MODEL ?? workerEnv.AI_MODEL ?? process.env.AI_MODEL,
  };
}

export function aiConfig(): AiConfig | null {
  const values = runtimeEnv();
  if (!values.AI_API_KEY) return null;
  return {
    provider: values.AI_PROVIDER || "openai-compatible",
    baseUrl: (values.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    key: values.AI_API_KEY,
    model: values.AI_MODEL || "gpt-5.6-luna",
  };
}

function fallbackRewrite(text: string, mode: AssistanceMode) {
  if (mode === "chinese") return "AI 未连接，暂时无法生成中文详解。";
  const key = text.trim().toLowerCase().replace(/[.,;:!?“”'\"]/g, "");
  const glossary: Record<string, string> = {
    metaphysical: "concerned with the deepest nature of reality, beyond what can be physically measured",
    reconciliation: "the process of making two opposed ideas or people fit together again",
    mechanical: "related to machines, or done automatically without much thought",
    precision: "the quality of being exact and carefully controlled",
    uncertainty: "a state in which something is not known or settled",
    trivial: "too small or unimportant to deserve much attention",
    legible: "clear enough to read or understand",
    hinge: "literally a joint on a door; figuratively, the crucial point on which something depends",
    rhetorical: "designed to create a particular effect on the reader, not only to report facts",
    orthodox: "following the established or traditionally accepted beliefs of a group",
    essence: "the most important underlying nature of something",
    occurrence: "an event or something that happens",
  };
  return glossary[key] ?? "Keep the main subject and verb in view, then read each added phrase as extra information. The AI connection is unavailable, so this is only general reading guidance.";
}

export async function rewriteSelection(input: RewriteInput) {
  const text = input.text?.trim();
  if (!text) return { status: 400, body: { error: "Select some text first." } };
  const mode = input.mode ?? "english";

  const config = aiConfig();
  if (!config) {
    return { status: 200, body: { rewrite: fallbackRewrite(text, mode) }, provider: "offline-demo" };
  }

  const prompt = selectionPrompt({
    ...input,
    text: text.slice(0, 1200),
    context: {
      before: input.context?.before?.slice(-700),
      after: input.context?.after?.slice(0, 700),
    },
    bookTitle: input.bookTitle?.slice(0, 200),
    mode,
  });

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.key}`,
    },
    body: JSON.stringify({
      model: config.model,
      stream: false,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      max_tokens: prompt.maxTokens,
      temperature: 0.1,
      ...(config.provider.toLowerCase() === "deepseek"
        ? { thinking: { type: "disabled" } }
        : {}),
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(`${config.provider} returned ${response.status}${detail?.error?.message ? `: ${detail.error.message}` : ""}`);
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const rewrite = data.choices?.[0]?.message?.content?.trim();
  if (!rewrite) throw new Error(`${config.provider} returned no rewrite.`);
  return {
    status: 200,
    body: { rewrite },
    provider: `${config.provider} | ${config.model}`,
  };
}
