const SECURITY_HEADERS = {
  "Content-Security-Policy": "frame-ancestors 'none'",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} as const;

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function rejectCrossOriginMutation(request: Request) {
  if (!MUTATION_METHODS.has(request.method.toUpperCase())) return null;
  const origin = request.headers.get("Origin");
  // Native device-token requests do not carry a browser Origin header.
  if (!origin || origin === new URL(request.url).origin) return null;
  return Response.json({ error: "Cross-origin mutation denied." }, { status: 403 });
}

export function withSecurityHeaders(response: Response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
