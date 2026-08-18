export function providerRequestOptions(provider: string): Record<string, unknown> {
  switch (provider.trim().toLowerCase()) {
    case "deepseek":
      return { thinking: { type: "disabled" } };
    case "qwen":
    case "dashscope":
      return { enable_thinking: false };
    default:
      return {};
  }
}
