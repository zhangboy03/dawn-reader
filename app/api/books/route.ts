import { desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getBooksBucket, getDb } from "../../../db";
import { readerBooks } from "../../../db/schema";
import { bookObjectKey } from "../../../src/server/library";

export const dynamic = "force-dynamic";
const MAX_EPUB_BYTES = 40 * 1024 * 1024;

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  const books = await getDb().select({
    id: readerBooks.id,
    title: readerBooks.title,
    fileName: readerBooks.fileName,
    fileSize: readerBooks.fileSize,
    addedAt: readerBooks.addedAt,
    updatedAt: readerBooks.updatedAt,
  }).from(readerBooks)
    .where(eq(readerBooks.userId, user.userId))
    .orderBy(desc(readerBooks.updatedAt));
  return Response.json({ books });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  const id = String(form.get("id") ?? "").trim();
  const title = String(form.get("title") ?? "").trim().slice(0, 300);
  const addedAt = String(form.get("addedAt") ?? "").trim();
  if (!(file instanceof File) || !id || id.length > 512 || !title) {
    return Response.json({ error: "Invalid EPUB upload." }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".epub") || file.size > MAX_EPUB_BYTES) {
    return Response.json({ error: "EPUB files must be 40 MB or smaller." }, { status: 400 });
  }

  const now = new Date().toISOString();
  await getBooksBucket().put(bookObjectKey(user.userId, id), file.stream(), {
    httpMetadata: { contentType: "application/epub+zip" },
  });
  await getDb().insert(readerBooks).values({
    userId: user.userId,
    id,
    title,
    fileName: file.name.slice(0, 500),
    fileSize: file.size,
    addedAt: addedAt || now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [readerBooks.userId, readerBooks.id],
    set: {
      title,
      fileName: file.name.slice(0, 500),
      fileSize: file.size,
      updatedAt: now,
    },
  });
  return Response.json({ id, syncedAt: now });
}
