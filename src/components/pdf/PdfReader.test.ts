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
    expect(source).toContain("toggleBounds.bottom + 4");
    expect(source).toContain('"--pdf-appearance-anchor-x"');
    expect(source).toContain('"--pdf-appearance-anchor-y"');
    expect(css).toContain("top: var(--pdf-appearance-anchor-y, 55px)");
    expect(css).toContain("left: clamp(12px, calc(var(--pdf-appearance-anchor-x, 50vw) - 80px), calc(100vw - 172px))");
    expect(css).toContain("width: 160px");
    expect(css).toContain("gap: 14px");
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

describe("PDF open reliability", () => {
  it("waits for the restored target page to paint instead of treating pagesinit as ready", () => {
    const source = readFileSync("src/components/pdf/PdfReader.tsx", "utf8");
    const pagesInit = source.slice(source.indexOf(`on("pagesinit"`), source.indexOf(`on("pagesloaded"`));

    expect(pagesInit).not.toContain('setStatus("ready")');
    expect(source).toContain("isSuccessfulTargetPageRender");
    expect(source).toContain('on("pagerendered"');
    expect(source).toContain('setStatus("ready")');
  });

  it("bounds first paint and offers an in-place retry", () => {
    const source = readFileSync("src/components/pdf/PdfReader.tsx", "utf8");

    expect(source).toContain("FIRST_PAINT_TIMEOUT_MS");
    expect(source).toContain("PDF 页面显示超时。");
    expect(source).toContain("重试打开");
    expect(source).toContain("setOpenAttempt((attempt) => attempt + 1)");
    expect(source).toContain("await teardownRef.current");
    expect(source).toContain("teardownRef.current = Promise.resolve(ownedLoadingTask?.destroy?.())");
    expect(source).toContain("if (restoredRef.current) persistPosition(); onClose();");
  });
});
