import { beforeEach, describe, expect, it } from "vitest";
import {
  cookieValue,
  credentialFingerprint,
  DAWN_SESSION_COOKIE,
  isSameOriginMutation,
  normalizeInviteCode,
  randomCredential,
  randomInviteCode,
  safeReturnPath,
  sessionCookie,
} from "./dawnAuthPrimitives";

describe("Dawn invitation and session primitives", () => {
  beforeEach(() => {
    globalThis.__DAWN_READER_ENV__ = {
      DAWN_AUTH_HMAC_KEY: "test-only-secret-with-at-least-thirty-two-bytes",
    };
  });

  it("generates high-entropy single-purpose credentials", () => {
    const first = randomInviteCode();
    const second = randomInviteCode();
    expect(first).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{2}$/);
    expect(second).not.toBe(first);
    expect(normalizeInviteCode(first.toLowerCase())).toHaveLength(10);
    expect(normalizeInviteCode("IO01-AAAA-AA")).toBeNull();
    expect(randomCredential("dawn_sess_")).toMatch(/^dawn_sess_[A-Za-z0-9_-]{43}$/);
  });

  it("fingerprints credentials without storing the raw value", async () => {
    const first = await credentialFingerprint("dawn_inv_example");
    const second = await credentialFingerprint("dawn_inv_example");
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
    expect(first).not.toContain("example");
  });

  it("uses a hardened host-only session cookie", () => {
    const header = sessionCookie("dawn_sess_example");
    expect(header).toContain(`${DAWN_SESSION_COOKIE}=dawn_sess_example`);
    expect(header).toContain("Path=/");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Lax");
    expect(header).not.toContain("Domain=");
    expect(cookieValue(`${header}; another=value`, DAWN_SESSION_COOKIE)).toBe("dawn_sess_example");
  });

  it("rejects external mutation origins and unsafe return paths", () => {
    expect(isSameOriginMutation(new Request("https://reader.example/api", {
      method: "POST",
      headers: { Origin: "https://reader.example" },
    }))).toBe(true);
    expect(isSameOriginMutation(new Request("https://reader.example/api", {
      method: "POST",
      headers: { Origin: "https://evil.example" },
    }))).toBe(false);
    expect(safeReturnPath("/reader?book=1")).toBe("/reader?book=1");
    expect(safeReturnPath("//evil.example")).toBe("/reader");
    expect(safeReturnPath("https://evil.example")).toBe("/reader");
  });
});
