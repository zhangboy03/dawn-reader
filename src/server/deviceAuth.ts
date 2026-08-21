const TOKEN_PREFIX = "dawn_";
const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeDeviceToken(value: string) {
  const compact = value.trim().replace(/[\s-]+/g, "").toUpperCase();
  if (!compact.startsWith(TOKEN_PREFIX.toUpperCase())) return "";
  const body = compact.slice(TOKEN_PREFIX.length);
  return body.length === 26 && [...body].every((character) => TOKEN_ALPHABET.includes(character))
    ? `${TOKEN_PREFIX}${body}`
    : "";
}

export function createDeviceToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(26));
  // The alphabet has exactly 32 symbols, so masking the low five unbiased bits
  // maps every random byte uniformly without modulo-bias ambiguity.
  const body = [...bytes].map((value) => TOKEN_ALPHABET[value & 31]).join("");
  return `${TOKEN_PREFIX}${body}`;
}

export function displayDeviceToken(token: string) {
  const normalized = normalizeDeviceToken(token);
  if (!normalized) return token;
  const body = normalized.slice(TOKEN_PREFIX.length);
  return `${TOKEN_PREFIX}${body.match(/.{1,4}/g)?.join("-") ?? body}`;
}

export async function hashDeviceToken(token: string) {
  const normalized = normalizeDeviceToken(token);
  if (!normalized) return "";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function bearerDeviceToken(request: Request) {
  const authorization = request.headers.get("Authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? normalizeDeviceToken(match[1]) : "";
}
