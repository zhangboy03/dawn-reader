import { rewriteSelection, type RewriteInput } from "../../../src/server/ai";
import { getChatGPTUser } from "../../chatgpt-auth";

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
    const result = await rewriteSelection(await request.json() as RewriteInput);
    const headers = result.provider ? { "X-AI-Provider": result.provider } : undefined;
    return Response.json(result.body, { status: result.status, headers });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Rewrite failed." },
      { status: 500 },
    );
  }
}
