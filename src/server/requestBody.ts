export class RequestLimitError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413 | 429,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "RequestLimitError";
  }
}

export function requestLimitResponse(error: RequestLimitError) {
  const headers = error.retryAfterSeconds
    ? { "Retry-After": String(error.retryAfterSeconds) }
    : undefined;
  return Response.json({ error: error.message }, { status: error.status, headers });
}

export function assertContentLength(request: Request, maximumBytes: number) {
  const raw = request.headers.get("content-length");
  if (!raw) return;
  const length = Number(raw);
  if (!Number.isFinite(length) || length < 0) {
    throw new RequestLimitError("Invalid Content-Length header.", 400);
  }
  if (length > maximumBytes) {
    throw new RequestLimitError("Request body is too large.", 413);
  }
}

export async function readJsonBody<T>(request: Request, maximumBytes: number): Promise<T> {
  assertContentLength(request, maximumBytes);
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > maximumBytes) {
    throw new RequestLimitError("Request body is too large.", 413);
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    throw new RequestLimitError("Invalid JSON request body.", 400);
  }
}
