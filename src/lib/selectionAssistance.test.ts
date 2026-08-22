import { afterEach, describe, expect, it, vi } from "vitest";
import {
  boundedSelectionContext,
  canRequestChinese,
  cloudflareColo,
  requestSelectionAssistance,
  serverTimingDuration,
} from "./selectionAssistance";

describe("PDF selection assistance", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("unlocks Chinese only after English succeeds", () => {
    expect(canRequestChinese({ english: { phase: "loading", text: "", error: "" }, chinese: { phase: "idle", text: "", error: "" } })).toBe(false);
    expect(canRequestChinese({ english: { phase: "success", text: "clear", error: "" }, chinese: { phase: "idle", text: "", error: "" } })).toBe(true);
  });

  it("sends exact bounded before and after context without repeating the selection", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.mode).toBe("chinese");
      expect(body.text).toBe("heat stress");
      expect(body.context).toEqual({ before: "before ", after: " after" });
      return new Response(JSON.stringify({ rewrite: "中文" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(requestSelectionAssistance({
      text: "heat stress",
      context: boundedSelectionContext("heat stress", "before heat stress after"),
      preset: "balanced",
      mode: "chinese",
    })).resolves.toBe("中文");
  });

  it("returns the exact nearest bounded page window and no fabricated fallback", () => {
    const context = boundedSelectionContext("target", "123456 target abcdef", 6);
    expect(context).toEqual({ before: "23456 ", after: " abcde" });
    expect(context.before.length).toBeLessThanOrEqual(6);
    expect(context.after.length).toBeLessThanOrEqual(6);
    expect(`123456 target abcdef`).toContain(`${context.before}target${context.after}`);
    expect(boundedSelectionContext("missing", "unrelated page")).toEqual({ before: "", after: "" });
  });

  it("parses only privacy-safe response diagnostics", () => {
    expect(serverTimingDuration("ai-provider;dur=812.4, ai-worker;dur=830.1", "ai-provider")).toBe(812.4);
    expect(serverTimingDuration("ai-provider;dur=812.4, ai-worker;dur=830.1", "ai-worker")).toBe(830.1);
    expect(serverTimingDuration(null, "ai-provider")).toBeNull();
    expect(cloudflareColo("a2f25b368aebf9ce-LAX")).toBe("LAX");
    expect(cloudflareColo("invalid")).toBeNull();
  });
});
