import { describe, expect, it } from "vitest";
import { pdfSearchStatusLabel } from "./PdfReader";

describe("pdfSearchStatusLabel", () => {
  it("does not claim zero results before the search finishes", () => {
    expect(pdfSearchStatusLabel("integrative", "searching", 0, 0)).toBe("正在搜索…");
  });

  it("shows completed match and zero-result states", () => {
    expect(pdfSearchStatusLabel("integrative", "done", 1, 5)).toBe("1 / 5");
    expect(pdfSearchStatusLabel("intergrative", "done", 0, 0)).toBe("0 个结果");
    expect(pdfSearchStatusLabel("   ", "idle", 0, 0)).toBe("");
  });
});
