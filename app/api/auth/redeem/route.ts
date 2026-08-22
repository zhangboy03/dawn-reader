import {
  redeemReaderInvite,
  safeReturnPath,
  sessionCookie,
} from "../../../../src/server/dawnAuth";

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const code = typeof form?.get("code") === "string" ? String(form.get("code")) : "";
  const returnTo = safeReturnPath(typeof form?.get("return_to") === "string" ? String(form.get("return_to")) : null);
  const redeemed = await redeemReaderInvite(request, code).catch(() => null);
  if (!redeemed) {
    const failure = new URL("/join", request.url);
    failure.searchParams.set("error", "invalid");
    failure.searchParams.set("return_to", returnTo);
    return Response.redirect(failure, 303);
  }
  const response = Response.redirect(new URL(returnTo, request.url), 303);
  response.headers.append("Set-Cookie", sessionCookie(redeemed.sessionSecret));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
