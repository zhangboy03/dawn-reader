import { getReaderIdentity } from "../../../../../chatgpt-auth";
import { revokeDawnSession } from "../../../../../../src/server/dawnAuth";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await getReaderIdentity(request);
  if (!owner || owner.role !== "owner" || owner.kind !== "chatgpt") {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }
  const { id } = await context.params;
  await revokeDawnSession(id, "owner_revoked");
  return Response.json({ revoked: true }, { headers: { "Cache-Control": "no-store" } });
}
