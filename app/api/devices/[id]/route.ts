import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { readerDevices } from "../../../../db/schema";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  await getDb().update(readerDevices).set({ revokedAt: new Date().toISOString() }).where(and(
    eq(readerDevices.id, id),
    eq(readerDevices.userId, user.userId),
  ));
  return Response.json({ ok: true });
}
