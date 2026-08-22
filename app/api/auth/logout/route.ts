import {
  clearedSessionCookie,
  isSameOriginMutation,
  revokeDawnSessionByCookie,
} from "../../../../src/server/dawnAuth";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return Response.json({ error: "Forbidden." }, { status: 403 });
  await revokeDawnSessionByCookie(request.headers.get("cookie")).catch(() => undefined);
  const response = Response.redirect(new URL("/", request.url), 303);
  response.headers.append("Set-Cookie", clearedSessionCookie());
  response.headers.set("Cache-Control", "no-store");
  return response;
}
