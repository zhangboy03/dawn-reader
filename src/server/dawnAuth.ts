import { and, desc, eq, isNull } from "drizzle-orm";
import { getDatabaseBinding, getDb } from "../../db";
import {
  readerAccounts,
  readerInvites,
  readerSessions,
} from "../../db/schema";
import type { ResolvedReaderAccount } from "./readerAccount";
import { currentEnvironment } from "./readerAccount";

export const DAWN_SESSION_COOKIE = "__Host-dawn_session";
const AUTH_KEY_VERSION = 1;
const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
const SESSION_IDLE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REDEEM_WINDOW_MS = 15 * 60 * 1000;
const REDEEM_ATTEMPT_LIMIT = 10;

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

export type DawnSessionIdentity = ResolvedReaderAccount & {
  role: "owner" | "reader";
  sessionId: string;
  kind: "dawn_session";
};

export async function resolveDawnSession(cookieHeader: string | null): Promise<DawnSessionIdentity | null> {
  const secret = cookieValue(cookieHeader, DAWN_SESSION_COOKIE);
  if (!secret || secret.length > 180) return null;
  const fingerprint = await credentialFingerprint(secret);
  const now = new Date().toISOString();
  const [session] = await getDb().select().from(readerSessions).where(and(
    eq(readerSessions.secretFingerprint, fingerprint),
    isNull(readerSessions.revokedAt),
  )).limit(1);
  if (!session || session.idleExpiresAt <= now || session.absoluteExpiresAt <= now) return null;
  const [account] = await getDb().select().from(readerAccounts)
    .where(eq(readerAccounts.id, session.accountId)).limit(1);
  if (!account || account.status !== "active" || account.authEpoch !== session.authEpoch) return null;

  if (Date.now() - Date.parse(session.lastUsedAt) > 60 * 60 * 1000) {
    await getDb().update(readerSessions).set({
      lastUsedAt: now,
      idleExpiresAt: new Date(Date.now() + SESSION_IDLE_TTL_MS).toISOString(),
    }).where(eq(readerSessions.id, session.id));
  }

  return {
    accountId: account.id,
    environment: currentEnvironment(),
    canClaimLegacyLocalData: account.legacyLocalClaimAllowed,
    role: account.role === "owner" ? "owner" : "reader",
    sessionId: session.id,
    kind: "dawn_session",
  };
}

async function requestBucket(request: Request) {
  const forwarded = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
  return credentialFingerprint(`redeem-rate:${forwarded}`);
}

async function redeemAttemptAllowed(request: Request) {
  const key = await requestBucket(request);
  const now = new Date();
  const nowIso = now.toISOString();
  const cutoff = new Date(now.getTime() - REDEEM_WINDOW_MS).toISOString();
  const row = await getDatabaseBinding().prepare(`
    INSERT INTO reader_auth_rate_limits (key, count, window_started_at, updated_at)
    VALUES (?1, 1, ?2, ?2)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN window_started_at < ?3 THEN 1 ELSE count + 1 END,
      window_started_at = CASE WHEN window_started_at < ?3 THEN excluded.window_started_at ELSE window_started_at END,
      updated_at = excluded.updated_at
    RETURNING count
  `).bind(key, nowIso, cutoff).first<{ count: number }>();
  return Boolean(row && row.count <= REDEEM_ATTEMPT_LIMIT);
}

export type InviteCreation = {
  accountId: string;
  inviteId: string;
  code: string;
  expiresAt: string;
};

export async function createReaderInvite(input: {
  ownerAccountId: string;
  displayName: string;
  contactEmail: string | null;
}): Promise<InviteCreation> {
  const displayName = input.displayName.trim().slice(0, 120);
  const contactEmail = input.contactEmail?.trim().toLowerCase().slice(0, 320) || null;
  if (!displayName) throw new Error("A tester label is required.");
  const accountId = crypto.randomUUID();
  const inviteId = crypto.randomUUID();
  const code = randomCredential("dawn_inv_");
  const fingerprint = await credentialFingerprint(code);
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS).toISOString();
  const db = getDatabaseBinding();
  await db.batch([
    db.prepare(`
      INSERT INTO reader_accounts (
        id, status, role, display_name, contact_email, auth_epoch,
        legacy_local_claim_allowed, created_at, updated_at
      ) VALUES (?1, 'active', 'reader', ?2, ?3, 0, 0, ?4, ?4)
    `).bind(accountId, displayName, contactEmail, nowIso),
    db.prepare(`
      INSERT INTO reader_invites (
        id, account_id, purpose, token_fingerprint, token_key_version,
        expires_at, created_at, created_by_account_id
      ) VALUES (?1, ?2, 'enroll', ?3, ?4, ?5, ?6, ?7)
    `).bind(inviteId, accountId, fingerprint, AUTH_KEY_VERSION, expiresAt, nowIso, input.ownerAccountId),
  ]);
  return { accountId, inviteId, code, expiresAt };
}

function resultChanges(result: D1Result<unknown>) {
  return Number(result.meta?.changes ?? 0);
}

export async function redeemReaderInvite(request: Request, code: string) {
  if (!isSameOriginMutation(request) || !await redeemAttemptAllowed(request)) return null;
  const normalized = code.trim();
  if (!normalized.startsWith("dawn_inv_") || normalized.length > 120) return null;
  const inviteFingerprint = await credentialFingerprint(normalized);
  const sessionSecret = randomCredential("dawn_sess_");
  const sessionFingerprint = await credentialFingerprint(sessionSecret);
  const sessionId = crypto.randomUUID();
  const now = new Date();
  const nowIso = now.toISOString();
  const idleExpiresAt = new Date(now.getTime() + SESSION_IDLE_TTL_MS).toISOString();
  const absoluteExpiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_TTL_MS).toISOString();
  const db = getDatabaseBinding();
  const results = await db.batch([
    db.prepare(`
      INSERT INTO reader_sessions (
        id, account_id, secret_fingerprint, secret_key_version, auth_epoch,
        created_at, last_used_at, idle_expires_at, absolute_expires_at, label
      )
      SELECT ?1, i.account_id, ?2, ?3, a.auth_epoch, ?4, ?4, ?5, ?6, 'Web browser'
      FROM reader_invites i
      JOIN reader_accounts a ON a.id = i.account_id
      WHERE i.token_fingerprint = ?7
        AND i.consumed_at IS NULL
        AND i.revoked_at IS NULL
        AND i.expires_at > ?4
        AND a.status = 'active'
    `).bind(
      sessionId,
      sessionFingerprint,
      AUTH_KEY_VERSION,
      nowIso,
      idleExpiresAt,
      absoluteExpiresAt,
      inviteFingerprint,
    ),
    db.prepare(`
      UPDATE reader_invites
      SET consumed_at = ?1
      WHERE token_fingerprint = ?2
        AND consumed_at IS NULL
        AND revoked_at IS NULL
        AND expires_at > ?1
    `).bind(nowIso, inviteFingerprint),
  ]);
  if (resultChanges(results[0]) !== 1 || resultChanges(results[1]) !== 1) return null;
  return { sessionSecret, sessionId };
}

export async function revokeDawnSession(sessionId: string, reason: string) {
  await getDb().update(readerSessions).set({
    revokedAt: new Date().toISOString(),
    revokeReason: reason.slice(0, 80),
  }).where(eq(readerSessions.id, sessionId));
}

export async function revokeDawnSessionByCookie(cookieHeader: string | null) {
  const secret = cookieValue(cookieHeader, DAWN_SESSION_COOKIE);
  if (!secret) return;
  const fingerprint = await credentialFingerprint(secret);
  await getDb().update(readerSessions).set({
    revokedAt: new Date().toISOString(),
    revokeReason: "user_logout",
  }).where(eq(readerSessions.secretFingerprint, fingerprint));
}

export async function revokeReaderInvite(inviteId: string) {
  await getDb().update(readerInvites).set({ revokedAt: new Date().toISOString() })
    .where(eq(readerInvites.id, inviteId));
}

export type OwnerInviteOverview = {
  accounts: Array<{
    id: string;
    role: string;
    status: string;
    displayName: string | null;
    contactEmail: string | null;
    createdAt: string;
  }>;
  invites: Array<{
    id: string;
    accountId: string;
    accountName: string | null;
    expiresAt: string;
    consumedAt: string | null;
    revokedAt: string | null;
    createdAt: string;
  }>;
  sessions: Array<{
    id: string;
    accountId: string;
    accountName: string | null;
    createdAt: string;
    lastUsedAt: string;
    absoluteExpiresAt: string;
    revokedAt: string | null;
  }>;
};

export async function ownerInviteOverview(): Promise<OwnerInviteOverview> {
  const [accounts, invites, sessions] = await Promise.all([
    getDb().select({
      id: readerAccounts.id,
      role: readerAccounts.role,
      status: readerAccounts.status,
      displayName: readerAccounts.displayName,
      contactEmail: readerAccounts.contactEmail,
      createdAt: readerAccounts.createdAt,
    }).from(readerAccounts).orderBy(desc(readerAccounts.createdAt)),
    getDb().select({
      id: readerInvites.id,
      accountId: readerInvites.accountId,
      expiresAt: readerInvites.expiresAt,
      consumedAt: readerInvites.consumedAt,
      revokedAt: readerInvites.revokedAt,
      createdAt: readerInvites.createdAt,
    }).from(readerInvites).orderBy(desc(readerInvites.createdAt)),
    getDb().select({
      id: readerSessions.id,
      accountId: readerSessions.accountId,
      createdAt: readerSessions.createdAt,
      lastUsedAt: readerSessions.lastUsedAt,
      absoluteExpiresAt: readerSessions.absoluteExpiresAt,
      revokedAt: readerSessions.revokedAt,
    }).from(readerSessions).orderBy(desc(readerSessions.createdAt)),
  ]);
  const accountNames = new Map(accounts.map((account) => [account.id, account.displayName]));
  return {
    accounts,
    invites: invites.map((invite) => ({ ...invite, accountName: accountNames.get(invite.accountId) ?? null })),
    sessions: sessions.map((session) => ({ ...session, accountName: accountNames.get(session.accountId) ?? null })),
  };
}
