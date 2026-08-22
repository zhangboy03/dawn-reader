import { desc, eq, isNull, and } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { readerDevices } from "../../../db/schema";
import { createDeviceToken, displayDeviceToken, hashDeviceToken } from "../../../src/server/deviceAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  const devices = await getDb().select({
    id: readerDevices.id,
    label: readerDevices.label,
    createdAt: readerDevices.createdAt,
    lastUsedAt: readerDevices.lastUsedAt,
  }).from(readerDevices).where(and(
    eq(readerDevices.userId, user.accountId),
    isNull(readerDevices.revokedAt),
  )).orderBy(desc(readerDevices.createdAt));
  return Response.json({ devices });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  const input = await request.json().catch(() => ({})) as { label?: unknown };
  const label = typeof input.label === "string" && input.label.trim()
    ? input.label.trim().slice(0, 80)
    : "新设备";
  const token = createDeviceToken();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await getDb().insert(readerDevices).values({
    id,
    userId: user.accountId,
    tokenHash: await hashDeviceToken(token),
    label,
    createdAt: now,
  });
  return Response.json({ id, label, token: displayDeviceToken(token), createdAt: now });
}
