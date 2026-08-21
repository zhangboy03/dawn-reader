import { eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getBooksBucket, getDatabaseBinding, getDb } from "../../../db";
import { readerBooks } from "../../../db/schema";
import { bookObjectKey } from "../../../src/server/library";
import { enforceRateLimit, readJsonBody, RequestLimitError, requestLimitResponse } from "../../../src/server/requestLimits";

export const dynamic = "force-dynamic";
const CONFIRMATION = "DELETE MY DAWN DATA";

export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  let input: { confirmation?: unknown };
  try {
    await enforceRateLimit({ scope: "account-delete", subject: user.userId, limit: 3, windowMs: 24 * 60 * 60 * 1000 });
    input = await readJsonBody(request, 1024);
  } catch (error) {
    if (error instanceof RequestLimitError) return requestLimitResponse(error);
    throw error;
  }
  if (input.confirmation !== CONFIRMATION) {
    return Response.json({ error: `Type ${CONFIRMATION} to confirm.` }, { status: 400 });
  }

  const books = await getDb().select({ id: readerBooks.id }).from(readerBooks)
    .where(eq(readerBooks.userId, user.userId));
  const keys = books.map((book) => bookObjectKey(user.userId, book.id));
  if (keys.length) await getBooksBucket().delete(keys);

  const binding = getDatabaseBinding();
  await binding.batch([
    binding.prepare("DELETE FROM reading_progress WHERE user_id = ?").bind(user.userId),
    binding.prepare("DELETE FROM reader_book_deletions WHERE user_id = ?").bind(user.userId),
    binding.prepare("DELETE FROM reader_books WHERE user_id = ?").bind(user.userId),
    binding.prepare("DELETE FROM reader_devices WHERE user_id = ?").bind(user.userId),
    binding.prepare("DELETE FROM reader_state WHERE user_id = ?").bind(user.userId),
    binding.prepare("DELETE FROM reader_rate_limits WHERE subject = ?").bind(user.userId),
  ]);

  return Response.json({ deleted: true, cloudBooksDeleted: keys.length }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
