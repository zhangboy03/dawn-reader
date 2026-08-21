import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isCloudEligiblePublication, shelfFormatLabel } from "./publication";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Dawn PDF product regression contracts", () => {
  it("QA-UI-001 loads the canonical shelf and global styles before the PDF chunk", () => {
    const app = source("src/App.tsx");
    const layout = source("app/layout.tsx");
    const library = source("src/components/Library.tsx");
    const publication = source("src/lib/publication.ts");
    const pdfCss = source("src/pdf-reader.css");

    expect(app).toContain("<Library");
    expect(layout).toContain('import "../src/styles.css"');
    expect(library).toContain('className="stored-shelf"');
    expect(library).toContain("shelfFormatLabel(book, book.synced)");
    expect(publication).toContain("export function shelfFormatLabel");
    expect(shelfFormatLabel({ format: "pdf", fileName: "paper.pdf" }, true)).toBe("PDF · 本机");
    expect(isCloudEligiblePublication({ format: "pdf", fileName: "paper.pdf" })).toBe(false);
    expect(pdfCss).not.toMatch(/\.publication-|\.stored-shelf|\.library-shell/);
    expect(existsSync(resolve(root, "src/components/PublicationLibrary.tsx"))).toBe(false);
  });

  it("QA-UI-002 replays highlights with point conversion and quarantines invalid records", () => {
    const highlights = source("src/lib/pdfHighlights.ts");
    expect(highlights).toContain("convertToViewportPoint");
    expect(highlights).not.toContain("convertToViewportRectangle(");
    expect(highlights).toContain("pdfHighlightQuarantineStorageKey");
    expect(highlights).toContain("Number.isFinite");
  });

  it("QA-UI-003 uses Dawn tokens and deliberate responsive PDF layout", () => {
    const css = source("src/pdf-reader.css");
    for (const token of ["#edf1ef", "#f4f6f3", "#182126", "#68777d", "#cbd4d3", "#dd7d45", "#a94f2e"]) {
      expect(css.toLowerCase()).toContain(token);
    }
    expect(css).toContain('"Avenir Next"');
    expect(css).toContain("@media (max-width: 900px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("QA-UI-004 retains pointer and keyboard selection plus every card action path", () => {
    const reader = source("src/components/pdf/PdfReader.tsx");
    const card = source("src/components/pdf/PdfSelectionCard.tsx");
    expect(reader).toContain('addEventListener("pointerup"');
    expect(reader).toContain('addEventListener("keyup"');
    expect(reader).toContain("requestSelectionAssistance");
    expect(reader).toContain("addPdfHighlight");
    expect(reader).toContain('event.key === "Escape"');
    expect(card).toContain("重试英文");
    expect(card).toContain("重试中文");
    expect(card).toContain("中文");
    expect(card).toContain("用黄色标记所选文字");
  });

  it("QA-UI-005 pins the real worker and regenerates matching support assets", () => {
    const pkgSource = source("package.json");
    const pkg = JSON.parse(pkgSource) as { dependencies?: Record<string, string>; scripts?: Record<string, string> };
    const script = source("scripts/sync-pdfjs-assets.mjs");
    const reader = source("src/components/pdf/PdfReader.tsx");
    expect(pkg.dependencies?.["pdfjs-dist"]).toBe("6.2.108");
    expect(pkg.scripts?.prebuild).toBe("npm run sync:pdfjs");
    const scriptVersion = script.match(/const\s+EXPECTED_VERSION\s*=\s*"([^"]+)"/)?.[1];
    expect(scriptVersion).toBe(pkg.dependencies?.["pdfjs-dist"]);
    expect(script).toContain("packageJson.version !== EXPECTED_VERSION");
    expect(script).not.toMatch(/\bexpectedVersion\b/);
    expect(reader).toContain("pdf.worker.min.mjs?url");
    expect(reader).toContain('cMapUrl: "/pdfjs/cmaps/"');
    expect(reader).toContain('standardFontDataUrl: "/pdfjs/standard_fonts/"');
    expect(reader).toContain('wasmUrl: "/pdfjs/wasm/"');
  });
});
