// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { ReadingHistory } from "./ReadingHistory";

describe("reading history PDF AI monitoring", () => {
  it("keeps the local-only performance summary outside the reading surface", () => {
    render(<ReadingHistory onClose={() => undefined} onOpenSource={() => undefined} />);
    expect(screen.getByRole("region", { name: "PDF AI 性能（仅本机）" })).toBeInTheDocument();
    expect(screen.getByText("从下一次 PDF“简明英文”开始记录；不保存论文原文或回答。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出 JSON" })).toBeDisabled();
  });
});
