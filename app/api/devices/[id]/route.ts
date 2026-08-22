import { and, eq, isNull } from "drizzle-orm";
import { getReaderIdentity } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { readerDevices } from "../../../../db/schema";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getReaderIdentity(request);
  if (!user || user.kind === "device") return Response.json({ error: "Sign in required." }, { status: 401 });
  const input = await request.json().catch(() => ({})) as { label?: unknown };
  const label = typeof input.label === "string" ? input.label.trim().slice(0, 80) : "";
  if (!label) return Response.json({ error: "请输入设备名称。" }, { status: 400 });
  const { id } = await params;
  const [device] = await getDb().update(readerDevices).set({ label }).where(and(
    eq(readerDevices.id, id),
    eq(readerDevices.userId, user.accountId),
    isNull(readerDevices.revokedAt),
  )).returning({
    id: readerDevices.id,
    label: readerDevices.label,
    createdAt: readerDevices.createdAt,
    lastUsedAt: readerDevices.lastUsedAt,
  });
  if (!device) return Response.json({ error: "找不到这台设备。" }, { status: 404 });
  return Response.json({ device });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getReaderIdentity(request);
  if (!user || user.kind === "device") return Response.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  await getDb().update(readerDevices).set({ revokedAt: new Date().toISOString() }).where(and(
    eq(readerDevices.id, id),
    eq(readerDevices.userId, user.accountId),
  ));
  return Response.json({ ok: true });
}
