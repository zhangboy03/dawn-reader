// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SelectionAssistAnchor } from "../../lib/selectionAssistAnchor";
import { PdfSelectionCard } from "./PdfSelectionCard";

const focusRect = { left: 20, right: 120, top: 200, bottom: 224, width: 100, height: 24 };
const anchor: SelectionAssistAnchor = {
  rects: [focusRect],
  focusRect,
  focusPoint: { x: 70, y: 212 },
  focusIndex: 0,
  direction: "forward",
  strategy: "direction",
};
const emptyChat = { draft: "", messages: [], state: "idle" as const, error: "" };

class Observer {
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: Observer });
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PDF selection card", () => {
  it("keeps yellow highlighting independent and reveals Chinese only after English succeeds", () => {
    const onChinese = vi.fn();
    const onHighlight = vi.fn();
    const { rerender } = render(<PdfSelectionCard
      anchor={anchor}
      mode="rewrite"
      state={{ english: { phase: "loading", text: "", error: "" }, chinese: { phase: "idle", text: "", error: "" } }}
      chat={emptyChat}
      highlightState={{ phase: "idle", message: "" }}
      onHighlight={onHighlight}
      onChinese={onChinese}
      onRetryEnglish={() => undefined}
      onModeToggle={() => undefined}
      onChatDraftChange={() => undefined}
      onChatSubmit={() => undefined}
      onChatRetry={() => undefined}
      onClose={() => undefined}
    />);
    expect(screen.queryByRole("button", { name: "中文" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "用黄色标记所选文字" }));
    expect(onHighlight).toHaveBeenCalledOnce();

    rerender(<PdfSelectionCard
      anchor={anchor}
      mode="rewrite"
      state={{ english: { phase: "success", text: "Clear English", error: "" }, chinese: { phase: "idle", text: "", error: "" } }}
      chat={emptyChat}
      highlightState={{ phase: "saved", message: "高亮已保存在本机" }}
      onHighlight={onHighlight}
      onChinese={onChinese}
      onRetryEnglish={() => undefined}
      onModeToggle={() => undefined}
      onChatDraftChange={() => undefined}
      onChatSubmit={() => undefined}
      onChatRetry={() => undefined}
      onClose={() => undefined}
    />);
    expect(screen.getByText("Clear English")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    expect(onChinese).toHaveBeenCalledOnce();
  });

  it("keeps retry paths explicit without replacing a successful English result", () => {
    const onChinese = vi.fn();
    render(<PdfSelectionCard
      anchor={anchor}
      mode="rewrite"
      state={{ english: { phase: "success", text: "Clear English", error: "" }, chinese: { phase: "error", text: "", error: "中文解释暂时失败。" } }}
      chat={emptyChat}
      highlightState={{ phase: "error", message: "标记未保存" }}
      onHighlight={() => undefined}
      onChinese={onChinese}
      onRetryEnglish={() => undefined}
      onModeToggle={() => undefined}
      onChatDraftChange={() => undefined}
      onChatSubmit={() => undefined}
      onChatRetry={() => undefined}
      onClose={() => undefined}
    />);
    expect(screen.getByText("Clear English")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试中文" }));
    expect(onChinese).toHaveBeenCalledOnce();
    expect(screen.getByText("标记未保存")).toBeInTheDocument();
  });

  it("keeps question mode quiet until the reader types and never repeats the selected passage", () => {
    const onSubmit = vi.fn();
    const onModeToggle = vi.fn();
    const { rerender } = render(<PdfSelectionCard
      anchor={anchor}
      mode="ask"
      state={{ english: { phase: "idle", text: "", error: "" }, chinese: { phase: "idle", text: "", error: "" } }}
      chat={emptyChat}
      highlightState={{ phase: "idle", message: "" }}
      onHighlight={() => undefined}
      onChinese={() => undefined}
      onRetryEnglish={() => undefined}
      onModeToggle={onModeToggle}
      onChatDraftChange={() => undefined}
      onChatSubmit={onSubmit}
      onChatRetry={() => undefined}
      onClose={() => undefined}
    />);

    expect(screen.getByRole("dialog", { name: "AI 提问" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("输入你想问的问题…")).toBeInTheDocument();
    expect(screen.queryByText("选中")).not.toBeInTheDocument();
    expect(screen.queryByText("局部上下文")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "划线后：AI 提问。点击切换：英文改写" }));
    expect(onModeToggle).toHaveBeenCalledOnce();

    rerender(<PdfSelectionCard
      anchor={anchor}
      mode="ask"
      state={{ english: { phase: "idle", text: "", error: "" }, chinese: { phase: "idle", text: "", error: "" } }}
      chat={{ ...emptyChat, draft: "这和上一段有什么关系？" }}
      highlightState={{ phase: "idle", message: "" }}
      onHighlight={() => undefined}
      onChinese={() => undefined}
      onRetryEnglish={() => undefined}
      onModeToggle={onModeToggle}
      onChatDraftChange={() => undefined}
      onChatSubmit={onSubmit}
      onChatRetry={() => undefined}
      onClose={() => undefined}
    />);
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    expect(onSubmit).toHaveBeenCalledOnce();

    rerender(<PdfSelectionCard
      anchor={anchor}
      mode="ask"
      state={{ english: { phase: "idle", text: "", error: "" }, chinese: { phase: "idle", text: "", error: "" } }}
      chat={{
        ...emptyChat,
        messages: [
          { role: "user", content: "这和上一段有什么关系？" },
          { role: "assistant", content: "这里延续了上一段的区分。", sources: [{ title: "Primary source", url: "https://example.com/source" }] },
        ],
      }}
      highlightState={{ phase: "idle", message: "" }}
      onHighlight={() => undefined}
      onChinese={() => undefined}
      onRetryEnglish={() => undefined}
      onModeToggle={onModeToggle}
      onChatDraftChange={() => undefined}
      onChatSubmit={onSubmit}
      onChatRetry={() => undefined}
      onClose={() => undefined}
    />);
    expect(screen.getByText("问题")).toBeInTheDocument();
    expect(screen.getByText("回答")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "来源" })).toContainElement(screen.getByRole("link", { name: "[1] Primary source" }));
  });
});
