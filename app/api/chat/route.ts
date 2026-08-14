import { chatAboutSelection, type ChatInput } from "../../../src/server/ai";
import { getReaderIdentity } from "../../chatgpt-auth";

export async function POST(request: Request) {
  try {
    if (!await getReaderIdentity(request)) {
      return Response.json({ error: "Sign in required." }, { status: 401 });
    }
    const result = await chatAboutSelection(await request.json() as ChatInput);
    const headers = result.provider ? { "X-AI-Provider": result.provider } : undefined;
    return Response.json(result.body, { status: result.status, headers });
  } catch (error) {
    console.error("AI chat failed", error);
    return Response.json(
      { error: "对话服务暂时不可用，请稍后重试。" },
      { status: 502 },
    );
  }
}
