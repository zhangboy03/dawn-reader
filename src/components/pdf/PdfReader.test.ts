import { readFileSync } from "node:fs";
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

describe("PDF appearance comparison", () => {
  it("keeps both candidate treatments available against the same three tones", () => {
    const source = readFileSync("src/components/pdf/PdfReader.tsx", "utf8");

    expect(source).toContain('data-pdf-treatment={appearance.treatment}');
    expect(source).toContain('data-pdf-appearance={appearance.tone}');
    expect(source).toContain('(["surroundings", "page"] as const)');
    expect(source).toContain('(["original", "warm", "night"] as const)');
    expect(source).toContain("只改变页面周围，PDF 保持原样。");
    expect(source).toContain("暖纸和夜读会调整屏幕显示，不修改 PDF 文件；原色可一键还原。");
  });

  it("does not couple the temporary comparison state to PDF.js rendering", () => {
    const source = readFileSync("src/components/pdf/PdfReader.tsx", "utf8");
    const css = readFileSync("src/pdf-reader.css", "utf8");

    expect(source).not.toContain("pageColors:");
    expect(source).not.toContain("pdfViewer.pageColors");
    expect(source).not.toContain("setDocument(pdfDocument, appearance");
    expect(css).toMatch(/\.dawn-pdf-viewer \.page\s*\{[^}]*filter:\s*var\(--pdf-page-filter, none\);/s);
    expect(css).not.toMatch(/\.dawn-pdf-viewer \.page\s*\{[^}]*transition:[^}]*filter/s);
    expect(css).not.toMatch(/\.dawn-pdf-viewer \.page\s*\{[^}]*will-change:\s*filter/s);
    expect(css).not.toContain("invert(");
    expect(css).not.toContain("hue-rotate(");
  });
});
