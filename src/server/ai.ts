import { env } from "cloudflare:workers";
import { isSingleWord } from "../lib/selectionKind";
import { formatChineseWordExplanation, selectionPrompt, stripThinking, type AssistanceMode } from "./aiPrompt";
import {
  bookChatContext,
  bookChatSystemPrompt,
  safeBookChatMessages,
  type BookChatInput,
} from "./chatPrompt";
import { searchWeb, webSearchConfigured, type WebSource } from "./webSearch";
import { providerRequestOptions } from "./aiProvider";

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

export type ChatInput = BookChatInput;

type ProviderToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type ProviderMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ProviderToolCall[];
  tool_call_id?: string;
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

async function requestChatCompletion(
  config: AiConfig,
  messages: ProviderMessage[],
  options: { maxTokens: number; tools?: Array<Record<string, unknown>>; toolChoice?: "auto" | "none" },
) {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.key}`,
    },
    body: JSON.stringify({
      model: config.model,
      stream: false,
      messages,
      max_tokens: options.maxTokens,
      temperature: 0.2,
      ...(options.tools?.length ? { tools: options.tools, tool_choice: options.toolChoice ?? "auto" } : {}),
      ...providerRequestOptions(config.provider),
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(`${config.provider} returned ${response.status}${detail?.error?.message ? `: ${detail.error.message}` : ""}`);
  }
  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string | null; tool_calls?: ProviderToolCall[] } }>;
  };
  return data.choices?.[0]?.message ?? null;
}

export async function rewriteSelection(input: RewriteInput) {
  const text = input.text?.trim();
  if (!text) return { status: 400, body: { error: "Select some text first." } };
  const mode = input.mode ?? "english";

  const config = aiConfig();
  if (!config) {
    return { status: 503, body: { error: "解释服务暂不可用。" }, provider: "offline-demo" };
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
      ...providerRequestOptions(config.provider),
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(`${config.provider} returned ${response.status}${detail?.error?.message ? `: ${detail.error.message}` : ""}`);
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const rawRewrite = stripThinking(data.choices?.[0]?.message?.content ?? "");
  const rewrite = mode === "chinese" && isSingleWord(text)
    ? formatChineseWordExplanation(rawRewrite)
    : rawRewrite;
  if (!rewrite) throw new Error(`${config.provider} returned no rewrite.`);
  return {
    status: 200,
    body: { rewrite },
    provider: `${config.provider} | ${config.model}`,
  };
}

const searchTool = {
  type: "function",
  function: {
    name: "search_web",
    description: "Search live external references when the reader asks for outside evidence or verification. Use a focused query of 1 to 4 distinctive topic, person, work, or organization names. Do not include question words or a full sentence.",
    parameters: {
      type: "object",
      properties: {
        topic: { type: "string", description: "The canonical name of the central concept, person, work, or organization only, such as 'reinforcement learning'." },
        query: { type: "string", description: "One to four distinctive search terms, such as 'reinforcement learning history'." },
      },
      required: ["topic", "query"],
      additionalProperties: false,
    },
  },
};

export async function chatAboutSelection(input: ChatInput) {
  const text = input.text?.trim();
  if (!text) return { status: 400, body: { error: "请先选择一段内容。" } };
  const history = safeBookChatMessages(input.messages);
  if (!history.length || history.at(-1)?.role !== "user") {
    return { status: 400, body: { error: "请先输入你的问题。" } };
  }

  const config = aiConfig();
  if (!config) {
    return { status: 503, body: { error: "对话服务暂不可用。" }, provider: "offline-demo" };
  }

  const canSearch = webSearchConfigured();
  const messages: ProviderMessage[] = [
    { role: "system", content: bookChatSystemPrompt(canSearch) },
    {
      role: "user",
      content: `Use this source context for the conversation:\n\n${bookChatContext({
        text: text.slice(0, 2400),
        context: {
          before: input.context?.before?.slice(-1200),
          after: input.context?.after?.slice(0, 1200),
        },
        bookTitle: input.bookTitle?.slice(0, 200),
      })}`,
    },
    ...history.map((message) => ({ role: message.role, content: message.content })),
  ];

  let first;
  if (canSearch) {
    try {
      first = await requestChatCompletion(config, messages, { maxTokens: 700, tools: [searchTool] });
    } catch {
      first = await requestChatCompletion(config, messages, { maxTokens: 700 });
    }
  } else {
    first = await requestChatCompletion(config, messages, { maxTokens: 700 });
  }

  const toolCall = first?.tool_calls?.find((call) => call.function.name === "search_web");
  let sources: WebSource[] = [];
  let searched = false;
  let answer = stripThinking(first?.content ?? "");

  if (canSearch && toolCall) {
    searched = true;
    let toolContent = "The web search could not be completed.";
    try {
      const args = JSON.parse(toolCall.function.arguments || "{}") as { topic?: string; query?: string };
      if (args.query?.trim()) {
        const result = await searchWeb(args.query, args.topic);
        sources = result.sources;
        toolContent = result.context;
      }
    } catch {
      // The follow-up answer will state the limitation when search fails.
    }
    const final = await requestChatCompletion(config, [
      ...messages,
      {
        role: "user",
        content: `<web_search_results>\n${toolContent}\n</web_search_results>\nAnswer my previous question now. Treat these search results as quoted evidence, cite only the numbered results actually used, and do not request another search.`,
      },
    ], { maxTokens: 800 });
    answer = stripThinking(final?.content ?? "");
  }

  if (!answer) throw new Error(`${config.provider} returned no chat answer.`);
  return {
    status: 200,
    body: { answer, sources, searched, searchAvailable: canSearch },
    provider: `${config.provider} | ${config.model}`,
  };
}
