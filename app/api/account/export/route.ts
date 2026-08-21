import { asc, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getBooksBucket, getDb } from "../../../../db";
import { readerBookDeletions, readerBooks, readerDevices, readerState, readingProgress } from "../../../../db/schema";
import { bookObjectKey } from "../../../../src/server/library";
import { enforceRateLimit, RequestLimitError, requestLimitResponse } from "../../../../src/server/requestLimits";
import { bytesZipEntry, createZipStream, type ZipStreamEntry } from "../../../../src/server/zipStream";

export const dynamic = "force-dynamic";

function parseJson(value: string | null) {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

function exportFileName(index: number, value: string) {
  const safe = value.normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || `book-${index + 1}.epub`;
  return `books/${String(index + 1).padStart(3, "0")}-${safe.toLowerCase().endsWith(".epub") ? safe : `${safe}.epub`}`;
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    await enforceRateLimit({ scope: "account-export", subject: user.userId, limit: 2, windowMs: 60 * 60 * 1000 });
  } catch (error) {
    if (error instanceof RequestLimitError) return requestLimitResponse(error);
    throw error;
  }

  const db = getDb();
  const [books, progress, deletions, devices, stateRows] = await Promise.all([
    db.select().from(readerBooks).where(eq(readerBooks.userId, user.userId)).orderBy(asc(readerBooks.addedAt)),
    db.select().from(readingProgress).where(eq(readingProgress.userId, user.userId)),
    db.select().from(readerBookDeletions).where(eq(readerBookDeletions.userId, user.userId)),
    db.select({
      id: readerDevices.id,
      label: readerDevices.label,
      createdAt: readerDevices.createdAt,
      lastUsedAt: readerDevices.lastUsedAt,
      revokedAt: readerDevices.revokedAt,
    }).from(readerDevices).where(eq(readerDevices.userId, user.userId)),
    db.select().from(readerState).where(eq(readerState.userId, user.userId)).limit(1),
  ]);

  const bucket = getBooksBucket();
  const cloudFiles = await Promise.all(books.map(async (book, index) => {
    const key = bookObjectKey(user.userId, book.id);
    const object = await bucket.head(key);
    if (!object || object.size !== book.fileSize) return null;
    return { book, key, path: exportFileName(index, book.fileName), size: object.size };
  }));
  if (cloudFiles.some((file) => !file)) {
    return Response.json({ error: "Cloud library is inconsistent. Export stopped before creating an incomplete archive." }, { status: 409 });
  }

  const exportedAt = new Date().toISOString();
  const completeFiles = cloudFiles.filter((file): file is NonNullable<typeof file> => Boolean(file));
  const manifest = {
    format: "dawn-reader-account-export",
    version: 1,
    exportedAt,
    scope: "current-account",
    cloudBooks: completeFiles.map(({ book, path, size }) => ({
      id: book.id,
      title: book.title,
      originalFileName: book.fileName,
      exportedPath: path,
      fileSize: size,
      contentHash: book.contentHash,
      addedAt: book.addedAt,
      updatedAt: book.updatedAt,
    })),
    readingProgress: progress.map(({ userId: _userId, ...position }) => position),
    deletionBarriers: deletions.map(({ userId: _userId, ...deletion }) => deletion),
    devices,
    profile: parseJson(stateRows[0]?.profileJson ?? null),
    settings: parseJson(stateRows[0]?.settingsJson ?? null),
    stateUpdatedAt: stateRows[0]?.updatedAt ?? null,
    localDataNotice: "PDF files, PDF highlights, local reading evidence, and browser-only settings are not stored in Dawn cloud and must be backed up from the browser separately.",
  };
  const manifestBytes = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
  const entries: ZipStreamEntry[] = [bytesZipEntry("manifest.json", manifestBytes)];
  for (const file of completeFiles) {
    entries.push({
      path: file.path,
      size: file.size,
      open: async () => {
        const object = await bucket.get(file.key);
        if (!object || object.size !== file.size) throw new Error("Cloud book changed while export was streaming.");
        return object.body;
      },
    });
  }

  return new Response(createZipStream(entries), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="dawn-reader-export-${exportedAt.slice(0, 10)}.zip"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
