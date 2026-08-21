import { rewriteSelection, type RewriteInput } from "../../../src/server/ai";
import { getReaderIdentity } from "../../chatgpt-auth";
import { enforceRateLimit, readJsonBody, RequestLimitError, requestLimitResponse } from "../../../src/server/requestLimits";

export async function POST(request: Request) {
  try {
    const identity = await getReaderIdentity(request);
    if (!identity) {
      return Response.json({ error: "Sign in required." }, { status: 401 });
    }
    await enforceRateLimit({ scope: "ai-rewrite-10m", subject: identity.userId, limit: 60, windowMs: 10 * 60 * 1000 });
    await enforceRateLimit({ scope: "ai-rewrite-day", subject: identity.userId, limit: 400, windowMs: 24 * 60 * 60 * 1000 });
    const result = await rewriteSelection(await readJsonBody<RewriteInput>(request, 16 * 1024));
    const headers = result.provider ? { "X-AI-Provider": result.provider } : undefined;
    return Response.json(result.body, { status: result.status, headers });
  } catch (error) {
    if (error instanceof RequestLimitError) return requestLimitResponse(error);
    console.error("AI rewrite failed", error);
    return Response.json(
      { error: "解释服务暂时不可用，请稍后重试。" },
      { status: 502 },
    );
  }
}
