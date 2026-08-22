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

describe("PDF appearance", () => {
  it("keeps the final menu focused on the three shared reading tones", () => {
    const source = readFileSync("src/components/pdf/PdfReader.tsx", "utf8");

    expect(source).toContain("data-pdf-appearance={appearanceTone}");
    expect(source).not.toContain("data-pdf-treatment");
    expect(source).not.toContain("处理方式");
    expect(source).toContain('theme: "paper", label: "原色"');
    expect(source).toContain('theme: "sepia", label: "暖纸"');
    expect(source).toContain('theme: "night", label: "夜读"');
    expect(source).toContain("saveReaderSettings(next)");
    expect(source).toContain("saveCloudState({ settings: next })");
  });

  it("uses an appearance glyph instead of the text-formatting Aa glyph", () => {
    const source = readFileSync("src/components/pdf/PdfReader.tsx", "utf8");

    expect(source).not.toContain(">Aa</button>");
    expect(source).toContain('className="dawn-pdf-appearance-icon"');
    expect(source).not.toContain('<svg className="dawn-pdf-appearance-icon"');
    expect(source).toContain('aria-controls="pdf-appearance-panel"');
    expect(source).toContain("PDF_APPEARANCE_OPTIONS.map");
  });

  it("keeps the appearance panel visual-only while retaining accessible names", () => {
    const source = readFileSync("src/components/pdf/PdfReader.tsx", "utf8");

    expect(source).not.toContain(">整页外观<");
    expect(source).not.toContain("<span>{label}</span>");
    expect(source).toContain("aria-label={label}");
    expect(source).toContain("dawn-pdf-tone-dot tone-${pdfAppearanceTone(theme)}");
  });

  it("anchors the appearance panel beneath its toolbar button at every breakpoint", () => {
    const source = readFileSync("src/components/pdf/PdfReader.tsx", "utf8");
    const css = readFileSync("src/pdf-reader.css", "utf8");

    expect(source).toContain("appearanceToggleRef");
    expect(source).toContain("toggleBounds.left + toggleBounds.width / 2");
    expect(source).toContain("toggleBounds.bottom + 8");
    expect(source).toContain('"--pdf-appearance-anchor-x"');
    expect(source).toContain('"--pdf-appearance-anchor-y"');
    expect(css).toContain("top: var(--pdf-appearance-anchor-y, 59px)");
    expect(css).toContain("left: clamp(12px, calc(var(--pdf-appearance-anchor-x, 50vw) - 86px), calc(100vw - 184px))");
    expect(css).not.toContain(".dawn-pdf-appearance-panel { top: 104px; }");
  });

  it("applies appearance after PDF.js rendering without changing its lifecycle", () => {
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
