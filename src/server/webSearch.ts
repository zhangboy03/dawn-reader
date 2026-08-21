import { env } from "cloudflare:workers";
import { plainTextFromSearchSnippet } from "./searchText";

export { plainTextFromSearchSnippet } from "./searchText";

type SearchEnv = { BRAVE_SEARCH_API_KEY?: string };

export type WebSource = {
  title: string;
  url: string;
};

type BraveResult = {
  title?: string;
  url?: string;
  description?: string;
  extra_snippets?: string[];
};

function safeHttpUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function searchApiKey() {
  const workerEnv = env as unknown as SearchEnv;
  const requestEnv = globalThis.__DAWN_READER_ENV__ as SearchEnv | undefined;
  return requestEnv?.BRAVE_SEARCH_API_KEY ?? workerEnv.BRAVE_SEARCH_API_KEY ?? process.env.BRAVE_SEARCH_API_KEY;
}

export function webSearchAvailable() {
  return true;
}

export function webSearchProvider() {
  return searchApiKey() ? "brave" : "wikipedia";
}

export async function searchWeb(query: string, topic?: string) {
  const key = searchApiKey();
  if (!key) return searchWikipedia(topic?.trim() || query);

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query.trim().slice(0, 400));
  url.searchParams.set("count", "5");
  url.searchParams.set("extra_snippets", "true");
  url.searchParams.set("safesearch", "moderate");
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": key,
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Search returned ${response.status}.`);

  const data = await response.json() as { web?: { results?: BraveResult[] } };
  const results = (data.web?.results ?? []).map((result) => ({
    ...result,
    title: plainTextFromSearchSnippet(result.title),
    url: safeHttpUrl(result.url) ?? undefined,
  }))
    .filter((result) => result.title && result.url)
    .slice(0, 5);
  const sources = results.map((result) => ({ title: result.title!, url: result.url! }));
  const context = results.map((result, index) => {
    const snippets = [result.description, ...(result.extra_snippets ?? [])]
      .map(plainTextFromSearchSnippet)
      .filter(Boolean)
      .join(" ");
    return `[${index + 1}] ${result.title}\nURL: ${result.url}\n${snippets}`;
  }).join("\n\n");
  return { context: context || "No relevant web results were found.", sources };
}

function containsCjk(text: string) {
  return /[\u3400-\u9fff]/u.test(text);
}

async function searchWikipedia(query: string) {
  const language = containsCjk(query) ? "zh" : "en";
  const url = new URL(`https://${language}.wikipedia.org/w/rest.php/v1/search/page`);
  url.searchParams.set("q", query.trim().slice(0, 400));
  url.searchParams.set("limit", "5");
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "DawnReader/0.1 (contact: https://github.com/zhangboy03/dawn-reader)",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Reference search returned ${response.status}.`);
  const data = await response.json() as {
    pages?: Array<{ id?: number; key?: string; title?: string; excerpt?: string; description?: string | null }>;
  };
  const results = (data.pages ?? []).filter((result) => result.title && result.key).slice(0, 5);
  const sources = results.map((result) => ({
    title: result.title!,
    url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(result.key!)}`,
  }));
  const context = results.map((result, index) => [
    `[${index + 1}] ${result.title}`,
    result.description ? `Description: ${plainTextFromSearchSnippet(result.description)}` : "",
    plainTextFromSearchSnippet(result.excerpt),
    `URL: ${sources[index].url}`,
  ].filter(Boolean).join("\n")).join("\n\n");
  return { context: context || "No relevant reference results were found.", sources };
}
