import { and, eq } from "drizzle-orm";
import { readerBooks } from "../../db/schema";
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
