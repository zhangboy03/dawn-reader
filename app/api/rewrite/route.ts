import { AiRequestError, rewriteSelection, type AiRequestDiagnostics, type RewriteInput } from "../../../src/server/ai";
import { getReaderIdentity } from "../../chatgpt-auth";

function diagnosticHeaders(startedAt: number, diagnostics?: AiRequestDiagnostics) {
  const workerMs = performance.now() - startedAt;
  const headers = new Headers({
    "Server-Timing": [
      diagnostics?.providerMs != null ? `ai-provider;dur=${diagnostics.providerMs.toFixed(1)}` : null,
      `ai-worker;dur=${workerMs.toFixed(1)}`,
    ].filter(Boolean).join(", "),
    "X-AI-Attempts": String(diagnostics?.attempts ?? 1),
  });
  if (diagnostics) {
    headers.set("X-AI-Model", diagnostics.reportedModel);
    headers.set("X-AI-Provider", diagnostics.provider);
    if (diagnostics.errorClass) headers.set("X-AI-Error-Class", diagnostics.errorClass);
    if (diagnostics.inputTokens != null) headers.set("X-AI-Input-Tokens", String(diagnostics.inputTokens));
    if (diagnostics.outputTokens != null) headers.set("X-AI-Output-Tokens", String(diagnostics.outputTokens));
  }
  return headers;
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  try {
    if (!await getReaderIdentity(request)) {
      return Response.json({ error: "Sign in required." }, { status: 401, headers: diagnosticHeaders(startedAt) });
    }
    const result = await rewriteSelection(await request.json() as RewriteInput);
    const headers = diagnosticHeaders(startedAt, result.diagnostics);
    if (!result.diagnostics && result.provider) headers.set("X-AI-Provider", result.provider);
    return Response.json(result.body, { status: result.status, headers });
  } catch (error) {
    console.error("AI rewrite failed", error);
    return Response.json(
      { error: "解释服务暂时不可用，请稍后重试。" },
      {
        status: 502,
        headers: diagnosticHeaders(startedAt, error instanceof AiRequestError ? error.diagnostics : {
          attempts: 1,
          errorClass: "worker_error",
          model: "unknown",
          provider: "unknown",
          reportedModel: "unknown",
        }),
      },
    );
  }
}
