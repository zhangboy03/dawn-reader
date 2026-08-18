import { describe, expect, it } from "vitest";
import { providerRequestOptions } from "./aiProvider";

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
});
