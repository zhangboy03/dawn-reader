import { and, eq } from "drizzle-orm";
import { getReaderIdentity } from "../../../chatgpt-auth";
import { ensureDeletionSchema, getBooksBucket, getDb } from "../../../../db";
import { readerBookDeletions, readerBooks, readingProgress } from "../../../../db/schema";
import { bookObjectKey } from "../../../../src/server/library";
import { deleteBookResources } from "../../../../src/server/deleteBookResources";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getReaderIdentity(request);
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  await ensureDeletionSchema();
  const { id } = await context.params;
  if (!id || id.length > 512) return Response.json({ error: "Invalid book id." }, { status: 400 });

  // Establish the deletion barrier before touching the payload. If R2 is
  // temporarily unavailable, stale devices still cannot resurrect the book
  // and a later DELETE can safely finish the cleanup.
  const db = getDb();
  const deletedAt = new Date().toISOString();
  await deleteBookResources({
    deleteObject: () => getBooksBucket().delete(bookObjectKey(user.accountId, id)),
    rememberDeletion: async () => { await db.insert(readerBookDeletions).values({
      userId: user.accountId,
      bookId: id,
      deletedAt,
    }).onConflictDoUpdate({
      target: [readerBookDeletions.userId, readerBookDeletions.bookId],
      set: { deletedAt },
    }); },
    deleteRecord: async () => { await db.delete(readerBooks).where(and(
      eq(readerBooks.userId, user.accountId),
      eq(readerBooks.id, id),
    )); },
    deleteProgress: async () => { await db.delete(readingProgress).where(and(
      eq(readingProgress.userId, user.accountId),
      eq(readingProgress.bookId, id),
    )); },
  });
  return Response.json({ deleted: true });
}
