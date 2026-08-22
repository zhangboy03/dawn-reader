import { and, eq } from "drizzle-orm";
import {
  readerAccounts,
  readerBookDeletions,
  readerBooks,
  readerDevices,
  readerIdentities,
  readerState,
  readingProgress,
} from "../../db/schema";
import { getDb } from "../../db";

export type ReaderEnvironment = "beta" | "public";

export type ExternalReaderIdentity = {
  issuer: "openai_sites";
  subject: string;
  email: string | null;
};

export type ResolvedReaderAccount = {
  accountId: string;
  environment: ReaderEnvironment;
  canClaimLegacyLocalData: boolean;
};

function currentEnvironment(): ReaderEnvironment {
  const runtime = globalThis.__DAWN_READER_ENV__ as { DAWN_ENVIRONMENT?: string } | undefined;
  const value = runtime?.DAWN_ENVIRONMENT ?? process.env.DAWN_ENVIRONMENT;
  return value === "public" ? "public" : "beta";
}

async function legacySubjectOwnsData(subject: string) {
  const db = getDb();
  const [state, book, progress, deletion, device] = await Promise.all([
    db.select({ id: readerState.userId }).from(readerState).where(eq(readerState.userId, subject)).limit(1),
    db.select({ id: readerBooks.id }).from(readerBooks).where(eq(readerBooks.userId, subject)).limit(1),
    db.select({ id: readingProgress.bookId }).from(readingProgress).where(eq(readingProgress.userId, subject)).limit(1),
    db.select({ id: readerBookDeletions.bookId }).from(readerBookDeletions).where(eq(readerBookDeletions.userId, subject)).limit(1),
    db.select({ id: readerDevices.id }).from(readerDevices).where(eq(readerDevices.userId, subject)).limit(1),
  ]);
  return Boolean(state.length || book.length || progress.length || deletion.length || device.length);
}

async function accountById(accountId: string) {
  const [account] = await getDb().select().from(readerAccounts)
    .where(eq(readerAccounts.id, accountId)).limit(1);
  if (!account || account.status !== "active") return null;
  return account;
}

export async function ensureReaderAccount(accountId: string, legacyLocalClaimAllowed = false) {
  const now = new Date().toISOString();
  await getDb().insert(readerAccounts).values({
    id: accountId,
    status: "active",
    legacyLocalClaimAllowed,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  if (legacyLocalClaimAllowed) {
    await getDb().update(readerAccounts).set({
      legacyLocalClaimAllowed: true,
      updatedAt: now,
    }).where(eq(readerAccounts.id, accountId));
  }
  return accountById(accountId);
}

export async function resolveReaderAccount(identity: ExternalReaderIdentity): Promise<ResolvedReaderAccount | null> {
  const environment = currentEnvironment();
  const db = getDb();
  const [existing] = await db.select().from(readerIdentities).where(and(
    eq(readerIdentities.environment, environment),
    eq(readerIdentities.issuer, identity.issuer),
    eq(readerIdentities.subject, identity.subject),
  )).limit(1);

  if (existing) {
    const account = await accountById(existing.accountId);
    if (!account) return null;
    if (Date.now() - Date.parse(existing.lastSeenAt) > 60 * 60 * 1000 || existing.emailSnapshot !== identity.email) {
      const now = new Date().toISOString();
      await db.update(readerIdentities).set({
        emailSnapshot: identity.email,
        lastSeenAt: now,
      }).where(eq(readerIdentities.id, existing.id));
    }
    return {
      accountId: account.id,
      environment,
      canClaimLegacyLocalData: account.legacyLocalClaimAllowed,
    };
  }

  // The owner-only compatibility floor deliberately keeps the existing opaque
  // data owner key. Ownership now resolves through reader_identities, so later
  // providers can link to this account without re-keying every D1/R2 record.
  const accountId = identity.subject;
  const [anyAccount] = await db.select({ id: readerAccounts.id }).from(readerAccounts).limit(1);
  const canClaimLegacyLocalData = !anyAccount || await legacySubjectOwnsData(identity.subject);
  const account = await ensureReaderAccount(accountId, canClaimLegacyLocalData);
  if (!account) return null;

  const now = new Date().toISOString();
  await db.insert(readerIdentities).values({
    id: crypto.randomUUID(),
    accountId,
    environment,
    issuer: identity.issuer,
    subject: identity.subject,
    emailSnapshot: identity.email,
    linkedAt: now,
    lastSeenAt: now,
  }).onConflictDoNothing();

  const [resolved] = await db.select().from(readerIdentities).where(and(
    eq(readerIdentities.environment, environment),
    eq(readerIdentities.issuer, identity.issuer),
    eq(readerIdentities.subject, identity.subject),
  )).limit(1);
  if (!resolved) return null;
  const resolvedAccount = await accountById(resolved.accountId);
  if (!resolvedAccount) return null;
  return {
    accountId: resolvedAccount.id,
    environment,
    canClaimLegacyLocalData: resolvedAccount.legacyLocalClaimAllowed,
  };
}

export async function resolveDeviceReaderAccount(accountId: string): Promise<ResolvedReaderAccount | null> {
  const account = await ensureReaderAccount(accountId);
  if (!account) return null;
  return {
    accountId: account.id,
    environment: currentEnvironment(),
    canClaimLegacyLocalData: false,
  };
}
