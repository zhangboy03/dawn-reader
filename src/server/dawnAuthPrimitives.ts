export const DAWN_SESSION_COOKIE = "__Host-dawn_session";
const SESSION_ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type RuntimeAuthEnv = { DAWN_AUTH_HMAC_KEY?: string };

function authSecret() {
  const runtime = globalThis.__DAWN_READER_ENV__ as RuntimeAuthEnv | undefined;
  const secret = runtime?.DAWN_AUTH_HMAC_KEY ?? process.env.DAWN_AUTH_HMAC_KEY;
  if (!secret || new TextEncoder().encode(secret).byteLength < 32) {
    throw new Error("Dawn authentication secret is unavailable.");
  }
  return secret;
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function randomCredential(prefix: "dawn_inv_" | "dawn_sess_") {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `${prefix}${base64Url(bytes)}`;
}

export async function credentialFingerprint(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function cookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(separator + 1).trim()); } catch { return null; }
  }
  return null;
}

export function sessionCookie(secret: string) {
  return `${DAWN_SESSION_COOKIE}=${encodeURIComponent(secret)}; Path=/; Max-Age=${Math.floor(SESSION_ABSOLUTE_TTL_MS / 1000)}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearedSessionCookie() {
  return `${DAWN_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export function safeReturnPath(value: string | null | undefined, fallback = "/reader") {
  if (
    !value
    || !value.startsWith("/")
    || value.startsWith("//")
    || value.includes("\\")
    || /[\u0000-\u001f\u007f]/.test(value)
  ) return fallback;
  return value;
}

export function isSameOriginMutation(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return true;
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}
