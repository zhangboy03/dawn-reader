import { aiConfig } from "../../../src/server/ai";

export async function GET() {
  const config = aiConfig();
  return Response.json({
    provider: config?.provider ?? "offline-demo",
    model: config?.model ?? null,
    configured: Boolean(config),
    pendingProvider: config ? null : "deepseek",
  });
}
