import { and, count, desc, eq, sum } from "drizzle-orm";
import { getReaderIdentity } from "../../chatgpt-auth";
import { getBooksBucket, getDb } from "../../../db";
import { readerBookDeletions, readerBooks } from "../../../db/schema";
import { bookObjectKey, legacyBooksWithoutHash, mergeBookRecords } from "../../../src/server/library";
import { canRestoreDeletedBook } from "../../../src/server/deleteBookResources";
import { InvalidEpubError, validateEpubUpload } from "../../../src/server/epubUpload";
import { assertContentLength, enforceRateLimit, RequestLimitError, requestLimitResponse } from "../../../src/server/requestLimits";

export const dynamic = "force-dynamic";
const MAX_EPUB_BYTES = 40 * 1024 * 1024;
const MAX_UPLOAD_BODY_BYTES = MAX_EPUB_BYTES + 128 * 1024;
const MAX_BOOKS_PER_USER = 25;
const MAX_STORAGE_BYTES_PER_USER = 500 * 1024 * 1024;

export async function GET(request: Request) {
  const user = await getReaderIdentity(request);
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  const books = await getDb().select({
    id: readerBooks.id,
    title: readerBooks.title,
    fileName: readerBooks.fileName,
    fileSize: readerBooks.fileSize,
    contentHash: readerBooks.contentHash,
    addedAt: readerBooks.addedAt,
    updatedAt: readerBooks.updatedAt,
  }).from(readerBooks)
    .where(eq(readerBooks.userId, user.userId))
    .orderBy(desc(readerBooks.updatedAt));
  const deletions = await getDb().select({ id: readerBookDeletions.bookId, deletedAt: readerBookDeletions.deletedAt })
    .from(readerBookDeletions)
    .where(eq(readerBookDeletions.userId, user.userId));
  return Response.json({ books, deletedBookIds: deletions.map((item) => item.id), deletedBooks: deletions });
}

export async function POST(request: Request) {
  const user = await getReaderIdentity(request);
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    assertContentLength(request, MAX_UPLOAD_BODY_BYTES);
    await enforceRateLimit({ scope: "book-upload", subject: user.userId, limit: 5, windowMs: 60 * 60 * 1000 });
  } catch (error) {
    if (error instanceof RequestLimitError) return requestLimitResponse(error);
    throw error;
  }
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "Invalid EPUB upload." }, { status: 400 });
  const file = form.get("file");
  const id = String(form.get("id") ?? "").trim();
  const title = String(form.get("title") ?? "").trim().slice(0, 300);
  const addedAt = String(form.get("addedAt") ?? "").trim();
  const rawContentHash = String(form.get("contentHash") ?? "").trim().toLowerCase();
  if (!(file instanceof File) || !id || id.length > 512 || !title) {
    return Response.json({ error: "Invalid EPUB upload." }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".epub") || file.size <= 0 || file.size > MAX_EPUB_BYTES) {
    return Response.json({ error: "EPUB files must be 40 MB or smaller." }, { status: 400 });
  }

  let fileBytes: ArrayBuffer;
  try {
    fileBytes = await validateEpubUpload(file);
  } catch (error) {
    if (error instanceof InvalidEpubError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
  const digest = await crypto.subtle.digest("SHA-256", fileBytes);
  const contentHash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  if ((rawContentHash && rawContentHash !== contentHash) || (id.startsWith("sha256:") && id !== `sha256:${contentHash}`)) {
    return Response.json({ error: "EPUB content hash does not match its identifier." }, { status: 400 });
  }

  const [[usage], [existingBook]] = await Promise.all([
    getDb().select({ bookCount: count(), totalBytes: sum(readerBooks.fileSize) }).from(readerBooks)
      .where(eq(readerBooks.userId, user.userId)),
    getDb().select({ fileSize: readerBooks.fileSize }).from(readerBooks).where(and(
      eq(readerBooks.userId, user.userId),
      eq(readerBooks.id, id),
    )).limit(1),
  ]);
  const nextCount = Number(usage?.bookCount ?? 0) + (existingBook ? 0 : 1);
  const nextBytes = Number(usage?.totalBytes ?? 0) - (existingBook?.fileSize ?? 0) + file.size;
  if (nextCount > MAX_BOOKS_PER_USER || nextBytes > MAX_STORAGE_BYTES_PER_USER) {
    return Response.json({
      error: "Cloud library limit reached. Remove an EPUB before uploading another.",
      limits: { books: MAX_BOOKS_PER_USER, bytes: MAX_STORAGE_BYTES_PER_USER },
    }, { status: 409 });
  }

  const now = new Date().toISOString();
  const [deletion] = await getDb().select({ deletedAt: readerBookDeletions.deletedAt })
    .from(readerBookDeletions)
    .where(and(
      eq(readerBookDeletions.userId, user.userId),
      eq(readerBookDeletions.bookId, id),
    ))
    .limit(1);
  if (deletion) {
    if (!canRestoreDeletedBook(addedAt, deletion.deletedAt)) {
      return Response.json({
        error: "This book was deleted on another device. Import it again to restore it.",
        code: "BOOK_DELETED",
      }, { status: 409 });
    }
  }
  await getBooksBucket().put(bookObjectKey(user.userId, id), fileBytes, {
    httpMetadata: { contentType: "application/epub+zip" },
  });
  await getDb().insert(readerBooks).values({
    userId: user.userId,
    id,
    title,
    fileName: file.name.slice(0, 500),
    fileSize: file.size,
    contentHash,
    addedAt: addedAt || now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [readerBooks.userId, readerBooks.id],
    set: {
      title,
      fileName: file.name.slice(0, 500),
      fileSize: file.size,
      contentHash,
      updatedAt: now,
    },
  });
  if (deletion) {
    await getDb().delete(readerBookDeletions).where(and(
      eq(readerBookDeletions.userId, user.userId),
      eq(readerBookDeletions.bookId, id),
    ));
  }

  const candidates = await legacyBooksWithoutHash(user.userId, file.size);
  for (const candidate of candidates) {
    if (candidate.id === id || candidate.contentHash) continue;
    const object = await getBooksBucket().get(bookObjectKey(user.userId, candidate.id));
    if (!object) continue;
    const candidateDigest = await crypto.subtle.digest("SHA-256", await object.arrayBuffer());
    const candidateHash = [...new Uint8Array(candidateDigest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    if (candidateHash === contentHash) {
      await mergeBookRecords(user.userId, id, candidate.id);
    } else {
      await getDb().update(readerBooks).set({ contentHash: candidateHash }).where(and(
        eq(readerBooks.userId, user.userId),
        eq(readerBooks.id, candidate.id),
      ));
    }
  }
  return Response.json({ id, syncedAt: now });
}
