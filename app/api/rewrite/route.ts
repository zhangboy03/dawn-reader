import { rewriteSelection, type RewriteInput } from "../../../src/server/ai";
import { isAuthorizedReaderRequest } from "../../chatgpt-auth";

export async function POST(request: Request) {
  try {
    if (!await isAuthorizedReaderRequest()) {
      return Response.json({ error: "Sign in required." }, { status: 401 });
    }
    const result = await rewriteSelection(await request.json() as RewriteInput);
    const headers = result.provider ? { "X-AI-Provider": result.provider } : undefined;
    return Response.json(result.body, { status: result.status, headers });
  } catch (error) {
    console.error("AI rewrite failed", error);
    return Response.json(
      { error: "解释服务暂时不可用，请稍后重试。" },
      { status: 502 },
    );
  }
}
