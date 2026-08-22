import { aiConfig } from "../../../src/server/ai";
import { webSearchConfigured } from "../../../src/server/webSearch";
import { getReaderIdentity } from "../../chatgpt-auth";

export async function GET(request: Request) {
  if (!await getReaderIdentity(request)) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  const config = aiConfig();
  return Response.json({
    provider: config?.provider ?? "offline-demo",
    model: config?.model ?? null,
    configured: Boolean(config),
    searchConfigured: webSearchConfigured(),
    pendingProvider: config ? null : "deepseek",
  });
}
