// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PdfSelectionCard } from "./PdfSelectionCard";

const anchor = { left: 20, right: 120, top: 20, bottom: 40 };

afterEach(cleanup);

describe("PDF selection card", () => {
  it("keeps yellow highlighting independent and reveals Chinese only after English succeeds", () => {
    const onChinese = vi.fn();
    const onHighlight = vi.fn();
    const { rerender } = render(<PdfSelectionCard
      anchor={anchor}
      state={{ english: { phase: "loading", text: "", error: "" }, chinese: { phase: "idle", text: "", error: "" } }}
      highlightState={{ phase: "idle", message: "" }}
      onHighlight={onHighlight}
      onChinese={onChinese}
      onRetryEnglish={() => undefined}
      onClose={() => undefined}
    />);
    expect(screen.queryByRole("button", { name: "中文" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "用黄色标记所选文字" }));
    expect(onHighlight).toHaveBeenCalledOnce();

    rerender(<PdfSelectionCard
      anchor={anchor}
      state={{ english: { phase: "success", text: "Clear English", error: "" }, chinese: { phase: "idle", text: "", error: "" } }}
      highlightState={{ phase: "saved", message: "高亮已保存在本机" }}
      onHighlight={onHighlight}
      onChinese={onChinese}
      onRetryEnglish={() => undefined}
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
      state={{ english: { phase: "success", text: "Clear English", error: "" }, chinese: { phase: "error", text: "", error: "中文解释暂时失败。" } }}
      highlightState={{ phase: "error", message: "标记未保存" }}
      onHighlight={() => undefined}
      onChinese={onChinese}
      onRetryEnglish={() => undefined}
      onClose={() => undefined}
    />);
    expect(screen.getByText("Clear English")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试中文" }));
    expect(onChinese).toHaveBeenCalledOnce();
    expect(screen.getByText("标记未保存")).toBeInTheDocument();
  });
});
