import { and, eq } from "drizzle-orm";
import { getReaderIdentity } from "../../../../chatgpt-auth";
import { getDb } from "../../../../../db";
import { readingProgress } from "../../../../../db/schema";
import { bookForUser } from "../../../../../src/server/library";

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
  const cfi = typeof input.cfi === "string" && input.cfi ? input.cfi.slice(0, 4000) : null;
  const nativeLocator = typeof input.nativeLocator === "string" && input.nativeLocator
    ? input.nativeLocator.slice(0, 12000)
    : null;
  const percentage = Math.round(input.percentage);
  const [existing] = await getDb().select().from(readingProgress).where(and(
    eq(readingProgress.userId, user.userId),
    eq(readingProgress.bookId, id),
  )).limit(1);
  if (existing && existing.updatedAt > requestedAt) {
    return Response.json({ position: existing, applied: false });
  }
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
