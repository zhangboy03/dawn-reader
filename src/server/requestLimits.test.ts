import { describe, expect, it } from "vitest";
import { assertContentLength, readJsonBody, RequestLimitError } from "./requestLimits";

describe("request body limits", () => {
  it("rejects an oversized declared body before parsing", () => {
    const request = new Request("https://reader.test/api", {
      method: "POST",
      headers: { "Content-Length": "101" },
      body: "{}",
    });
    expect(() => assertContentLength(request, 100)).toThrow(RequestLimitError);
  });

  it("rejects an oversized body when Content-Length is absent", async () => {
    const request = new Request("https://reader.test/api", { method: "POST", body: "123456" });
    await expect(readJsonBody(request, 5)).rejects.toMatchObject({ status: 413 });
  });

  it("parses bounded JSON", async () => {
    const request = new Request("https://reader.test/api", { method: "POST", body: '{"ok":true}' });
    await expect(readJsonBody(request, 64)).resolves.toEqual({ ok: true });
  });
});
