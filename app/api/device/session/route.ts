import { getReaderIdentity } from "../../../chatgpt-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = await getReaderIdentity(request);
  if (!identity || identity.kind !== "device") {
    return Response.json({ error: "Valid device pairing required." }, { status: 401 });
  }
  return Response.json({ connected: true });
}
