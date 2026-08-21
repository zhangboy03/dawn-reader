import { describe, expect, it } from "vitest";
import { rejectCrossOriginMutation, withSecurityHeaders } from "./securityHeaders";

describe("hosted response security headers", () => {
  it("prevents framing and unnecessary browser permissions without replacing route headers", async () => {
    const response = withSecurityHeaders(new Response("reader", {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    }));

    expect(response.status).toBe(201);
    expect(await response.text()).toBe("reader");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Security-Policy")).toBe("frame-ancestors 'none'");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Permissions-Policy")).toContain("microphone=()");
  });

  it("rejects browser mutations from another origin but preserves native bearer requests", async () => {
    const rejected = rejectCrossOriginMutation(new Request("https://reader.test/api/state", {
      method: "PUT",
      headers: { Origin: "https://attacker.test" },
    }));
    expect(rejected?.status).toBe(403);

    expect(rejectCrossOriginMutation(new Request("https://reader.test/api/state", {
      method: "PUT",
      headers: { Origin: "https://reader.test" },
    }))).toBeNull();
    expect(rejectCrossOriginMutation(new Request("https://reader.test/api/state", {
      method: "PUT",
      headers: { Authorization: "Bearer dawn_device" },
    }))).toBeNull();
    expect(rejectCrossOriginMutation(new Request("https://reader.test/api/state"))).toBeNull();
  });
});
