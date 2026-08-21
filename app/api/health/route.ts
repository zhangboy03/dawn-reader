import { aiConfig } from "../../../src/server/ai";
import { webSearchProvider } from "../../../src/server/webSearch";
import { isAuthorizedReaderRequest } from "../../chatgpt-auth";

export async function GET() {
  if (!await isAuthorizedReaderRequest()) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  const config = aiConfig();
  const searchProvider = webSearchProvider();
  return Response.json({
    provider: config?.provider ?? "offline-demo",
    model: config?.model ?? null,
    configured: Boolean(config),
    searchConfigured: searchProvider === "brave",
    searchProvider,
    pendingProvider: config ? null : "deepseek",
  });
}
