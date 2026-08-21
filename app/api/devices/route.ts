import { desc, eq, isNull, and, count } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { readerDevices } from "../../../db/schema";
import { createDeviceToken, displayDeviceToken, hashDeviceToken } from "../../../src/server/deviceAuth";
import { enforceRateLimit, readJsonBody, RequestLimitError, requestLimitResponse } from "../../../src/server/requestLimits";

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
    eq(readerDevices.userId, user.userId),
    isNull(readerDevices.revokedAt),
  )).orderBy(desc(readerDevices.createdAt));
  return Response.json({ devices });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  let input: { label?: unknown };
  try {
    await enforceRateLimit({ scope: "device-create", subject: user.userId, limit: 3, windowMs: 24 * 60 * 60 * 1000 });
    input = await readJsonBody(request, 2 * 1024);
  } catch (error) {
    if (error instanceof RequestLimitError) return requestLimitResponse(error);
    throw error;
  }
  const [usage] = await getDb().select({ activeDevices: count() }).from(readerDevices).where(and(
    eq(readerDevices.userId, user.userId),
    isNull(readerDevices.revokedAt),
  ));
  if (Number(usage?.activeDevices ?? 0) >= 3) {
    return Response.json({ error: "最多连接 3 台设备。请先移除旧设备。" }, { status: 409 });
  }
  const label = typeof input.label === "string" && input.label.trim()
    ? input.label.trim().slice(0, 80)
    : "新设备";
  const token = createDeviceToken();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await getDb().insert(readerDevices).values({
    id,
    userId: user.userId,
    tokenHash: await hashDeviceToken(token),
    label,
    createdAt: now,
  });
  return Response.json({ id, label, token: displayDeviceToken(token), createdAt: now });
}
