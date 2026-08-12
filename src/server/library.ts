import { and, eq, isNull } from "drizzle-orm";
import { readerBooks, readingProgress } from "../../db/schema";
import { getBooksBucket, getDb } from "../../db";

export function bookObjectKey(userId: string, bookId: string) {
  return `books/${encodeURIComponent(userId)}/${encodeURIComponent(bookId)}.epub`;
}

export async function bookForUser(userId: string, bookId: string) {
  const [book] = await getDb().select().from(readerBooks).where(and(
    eq(readerBooks.userId, userId),
    eq(readerBooks.id, bookId),
  )).limit(1);
  return book ?? null;
}

export async function mergeBookRecords(userId: string, canonicalID: string, duplicateID: string) {
  if (canonicalID === duplicateID) return;
  const db = getDb();
  const [canonicalProgress] = await db.select().from(readingProgress).where(and(
    eq(readingProgress.userId, userId),
    eq(readingProgress.bookId, canonicalID),
  )).limit(1);
  const [duplicateProgress] = await db.select().from(readingProgress).where(and(
    eq(readingProgress.userId, userId),
    eq(readingProgress.bookId, duplicateID),
  )).limit(1);
  if (duplicateProgress && (!canonicalProgress || duplicateProgress.updatedAt > canonicalProgress.updatedAt)) {
    await db.insert(readingProgress).values({
      ...duplicateProgress,
      bookId: canonicalID,
    }).onConflictDoUpdate({
      target: [readingProgress.userId, readingProgress.bookId],
      set: {
        cfi: duplicateProgress.cfi,
        nativeLocator: duplicateProgress.nativeLocator,
        percentage: duplicateProgress.percentage,
        updatedAt: duplicateProgress.updatedAt,
      },
    });
  }
  await db.delete(readingProgress).where(and(
    eq(readingProgress.userId, userId),
    eq(readingProgress.bookId, duplicateID),
  ));
  await db.delete(readerBooks).where(and(
    eq(readerBooks.userId, userId),
    eq(readerBooks.id, duplicateID),
  ));
  await getBooksBucket().delete(bookObjectKey(userId, duplicateID));
}

export async function legacyBooksWithoutHash(userId: string, fileSize: number) {
  return getDb().select().from(readerBooks).where(and(
    eq(readerBooks.userId, userId),
    eq(readerBooks.fileSize, fileSize),
    isNull(readerBooks.contentHash),
  ));
}
