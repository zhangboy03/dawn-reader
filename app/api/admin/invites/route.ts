import { getReaderIdentity } from "../../../chatgpt-auth";
import { createReaderInvite } from "../../../../src/server/dawnAuth";

export async function POST(request: Request) {
  const owner = await getReaderIdentity(request);
  if (!owner || owner.role !== "owner" || owner.kind !== "chatgpt") {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }
  const input = await request.json().catch(() => null) as { displayName?: unknown; contactEmail?: unknown } | null;
  const displayName = typeof input?.displayName === "string" ? input.displayName : "";
  const contactEmail = typeof input?.contactEmail === "string" ? input.contactEmail : null;
  try {
    const invite = await createReaderInvite({ ownerAccountId: owner.accountId, displayName, contactEmail });
    return Response.json({
      code: invite.code,
      expiresAt: invite.expiresAt,
      joinUrl: new URL("/join", request.url).toString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Unable to create invite." }, { status: 400 });
  }
}
