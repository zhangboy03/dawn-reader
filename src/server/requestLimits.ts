import { getDatabaseBinding } from "../../db";
import { RequestLimitError } from "./requestBody";

export { assertContentLength, readJsonBody, RequestLimitError, requestLimitResponse } from "./requestBody";

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
