import { getDatabaseBinding } from "../../db";

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

export async function enforceRateLimit(options: {
  scope: string;
  subject: string;
  limit: number;
  windowMs: number;
}) {
  const now = Date.now();
  const windowStart = Math.floor(now / options.windowMs) * options.windowMs;
  const result = await getDatabaseBinding().prepare(`
    INSERT INTO reader_rate_limits (scope, subject, window_start, count, updated_at)
    VALUES (?, ?, ?, 1, ?)
    ON CONFLICT(scope, subject, window_start)
    DO UPDATE SET count = count + 1, updated_at = excluded.updated_at
    RETURNING count
  `).bind(
    options.scope,
    options.subject,
    windowStart,
    new Date(now).toISOString(),
  ).first<{ count: number }>();

  if ((result?.count ?? options.limit + 1) > options.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowStart + options.windowMs - now) / 1000));
    throw new RequestLimitError("Too many requests. Please try again later.", 429, retryAfterSeconds);
  }
}
