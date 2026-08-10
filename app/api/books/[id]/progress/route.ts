import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { getDb } from "../../../../../db";
import { readingProgress } from "../../../../../db/schema";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  const [position] = await getDb().select({
    cfi: readingProgress.cfi,
    percentage: readingProgress.percentage,
    updatedAt: readingProgress.updatedAt,
  }).from(readingProgress).where(and(
    eq(readingProgress.userId, user.userId),
    eq(readingProgress.bookId, id),
  )).limit(1);
  return Response.json({ position: position ?? null });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  const input = await request.json() as { cfi?: string | null; percentage?: number };
  if (typeof input.percentage !== "number" || input.percentage < 0 || input.percentage > 100) {
    return Response.json({ error: "Invalid reading position." }, { status: 400 });
  }
  const now = new Date().toISOString();
  const cfi = typeof input.cfi === "string" && input.cfi ? input.cfi.slice(0, 4000) : null;
  const percentage = Math.round(input.percentage);
  await getDb().insert(readingProgress).values({
    userId: user.userId,
    bookId: id,
    cfi,
    percentage,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [readingProgress.userId, readingProgress.bookId],
    set: { cfi, percentage, updatedAt: now },
  });
  return Response.json({ position: { cfi, percentage, updatedAt: now } });
}
