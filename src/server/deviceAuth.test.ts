import { describe, expect, it } from "vitest";
import { bearerDeviceToken, displayDeviceToken, hashDeviceToken, normalizeDeviceToken } from "./deviceAuth";

const token = "dawn_ABCDEFGHJKLMNPQRSTUVWXYZ23";

describe("device pairing tokens", () => {
  it("accepts the displayed grouped form without weakening validation", () => {
    const displayed = displayDeviceToken(token);
    expect(displayed).toBe("dawn_ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-23");
    expect(normalizeDeviceToken(displayed)).toBe(token);
    expect(normalizeDeviceToken("dawn_short")).toBe("");
  });

  it("extracts bearer tokens and hashes normalized values consistently", async () => {
    const displayed = displayDeviceToken(token);
    expect(bearerDeviceToken(new Request("https://reader.test", {
      headers: { Authorization: `Bearer ${displayed}` },
    }))).toBe(token);
    expect(await hashDeviceToken(displayed)).toBe(await hashDeviceToken(token));
  });
});
