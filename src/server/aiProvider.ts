export function providerRequestOptions(provider: string): Record<string, unknown> {
  switch (provider.trim().toLowerCase()) {
    case "deepseek":
      return { thinking: { type: "disabled" } };
    case "qwen":
    case "dashscope":
      return { enable_thinking: false };
    case "gemini":
      return { reasoning_effort: "minimal" };
    default:
      return {};
  }
}

export function providerSamplingOptions(provider: string, temperature: number): Record<string, unknown> {
  return provider.trim().toLowerCase() === "gemini" ? {} : { temperature };
}
