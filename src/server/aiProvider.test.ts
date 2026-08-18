import { describe, expect, it } from "vitest";
import { providerRequestOptions, providerSamplingOptions } from "./aiProvider";

describe("AI provider request options", () => {
  it("disables DeepSeek thinking", () => {
    expect(providerRequestOptions("deepseek")).toEqual({ thinking: { type: "disabled" } });
  });

  it("disables Qwen thinking through its compatible API parameter", () => {
    expect(providerRequestOptions("qwen")).toEqual({ enable_thinking: false });
    expect(providerRequestOptions("dashscope")).toEqual({ enable_thinking: false });
  });

  it("does not add provider-specific fields for generic endpoints", () => {
    expect(providerRequestOptions("openai-compatible")).toEqual({});
  });

  it("uses Gemini's minimum reasoning effort without deprecated sampling fields", () => {
    expect(providerRequestOptions("gemini")).toEqual({ reasoning_effort: "minimal" });
    expect(providerSamplingOptions("gemini", 0.1)).toEqual({});
  });

  it("preserves temperature for providers that support it", () => {
    expect(providerSamplingOptions("qwen", 0.1)).toEqual({ temperature: 0.1 });
  });
});
