import { and, eq } from "drizzle-orm";
import { getReaderIdentity } from "../../../../chatgpt-auth";
import { getDb } from "../../../../../db";
import { readingProgress } from "../../../../../db/schema";
import { bookForUser } from "../../../../../src/server/library";
import { mergeProgressLocators } from "../../../../../src/server/progressMerge";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getReaderIdentity(request);
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  if (!await bookForUser(user.userId, id)) {
    return Response.json({ error: "Book not found." }, { status: 404 });
  }
  const [position] = await getDb().select({
    cfi: readingProgress.cfi,
    nativeLocator: readingProgress.nativeLocator,
    percentage: readingProgress.percentage,
    updatedAt: readingProgress.updatedAt,
  }).from(readingProgress).where(and(
    eq(readingProgress.userId, user.userId),
    eq(readingProgress.bookId, id),
  )).limit(1);
  return Response.json({ position: position ?? null });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getReaderIdentity(request);
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  if (!await bookForUser(user.userId, id)) {
    return Response.json({ error: "Book not found." }, { status: 404 });
  }
  const input = await request.json() as {
    cfi?: string | null;
    nativeLocator?: string | null;
    percentage?: number;
    updatedAt?: string;
  };
  if (typeof input.percentage !== "number" || input.percentage < 0 || input.percentage > 100) {
    return Response.json({ error: "Invalid reading position." }, { status: 400 });
  }
  const requestedAt = typeof input.updatedAt === "string" && Number.isFinite(Date.parse(input.updatedAt))
    ? new Date(input.updatedAt).toISOString()
    : new Date().toISOString();
  const percentage = Math.round(input.percentage);
  const [existing] = await getDb().select().from(readingProgress).where(and(
    eq(readingProgress.userId, user.userId),
    eq(readingProgress.bookId, id),
  )).limit(1);
  if (existing && existing.updatedAt > requestedAt) {
    return Response.json({ position: existing, applied: false });
  }
  const { cfi, nativeLocator } = mergeProgressLocators(existing ?? null, input);
  await getDb().insert(readingProgress).values({
    userId: user.userId,
    bookId: id,
    cfi,
    nativeLocator,
    percentage,
    updatedAt: requestedAt,
  }).onConflictDoUpdate({
    target: [readingProgress.userId, readingProgress.bookId],
    set: { cfi, nativeLocator, percentage, updatedAt: requestedAt },
  });
  // DELETE may race with a last progress write from an already-open reader.
  // Re-check ownership and remove the late write instead of reviving state.
  if (!await bookForUser(user.userId, id)) {
    await getDb().delete(readingProgress).where(and(
      eq(readingProgress.userId, user.userId),
      eq(readingProgress.bookId, id),
    ));
    return Response.json({ error: "Book was deleted while progress was syncing." }, { status: 409 });
  }
  return Response.json({ position: { cfi, nativeLocator, percentage, updatedAt: requestedAt }, applied: true });
}
