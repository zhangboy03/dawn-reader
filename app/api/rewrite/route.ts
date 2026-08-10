import { rewriteSelection, type RewriteInput } from "../../../src/server/ai";

export async function POST(request: Request) {
  try {
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
