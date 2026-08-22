import { afterEach, describe, expect, it, vi } from "vitest";

const { saveMock } = vi.hoisted(() => ({ saveMock: vi.fn(async () => undefined) }));

vi.mock("./aiPerformance", async () => ({
  ...await vi.importActual<typeof import("./aiPerformance")>("./aiPerformance"),
  saveAiPerformanceEvent: saveMock,
}));

import { requestSelectionAssistance } from "./selectionAssistance";

describe("PDF English performance capture", () => {
  afterEach(() => {
    saveMock.mockClear();
    vi.unstubAllGlobals();
  });

  it("records response timing without source text, context, title, or answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ rewrite: "clearer English" }), {
      headers: {
        "cf-ray": "a2f25b368aebf9ce-LAX",
        "Server-Timing": "ai-provider;dur=812.4, ai-worker;dur=830.1",
        "X-AI-Attempts": "1",
        "X-AI-Input-Tokens": "500",
        "X-AI-Model": "gemini-3.5-flash-lite",
        "X-AI-Output-Tokens": "80",
        "X-AI-Provider": "gemini",
      },
      status: 200,
    })));

    await expect(requestSelectionAssistance({
      context: { before: "private context", after: "private context" },
      mode: "english",
      monitor: "pdf",
      preset: "balanced",
      text: "private selected paper passage",
    })).resolves.toBe("clearer English");

    expect(saveMock).toHaveBeenCalledOnce();
    const saved = saveMock.mock.calls[0][0];
    expect(saved).toMatchObject({
      attempts: 1,
      cfColo: "LAX",
      inputTokens: 500,
      model: "gemini-3.5-flash-lite",
      outputTokens: 80,
      provider: "gemini",
      providerMs: 812.4,
      selectionKind: "phrase",
      success: true,
      surface: "pdf",
      workerMs: 830.1,
    });
    expect(saved).not.toHaveProperty("text");
    expect(saved).not.toHaveProperty("context");
    expect(saved).not.toHaveProperty("title");
    expect(saved).not.toHaveProperty("answer");
  });
});
