import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const reader = readFileSync("src/components/Reader.tsx", "utf8");
const pdfCard = readFileSync("src/components/pdf/PdfSelectionCard.tsx", "utf8");
const pdfReader = readFileSync("src/components/pdf/PdfReader.tsx", "utf8");
const shared = readFileSync("src/components/selection-assist/SelectionAssistSurface.tsx", "utf8");
const hook = readFileSync("src/components/selection-assist/useSelectionAssistSurface.ts", "utf8");
const css = readFileSync("src/selection-assist.css", "utf8");

describe("shared selection-assistance consumers", () => {
  it("proves EPUB/text and PDF use the same anchor, placement lifecycle, and shell", () => {
    expect(reader).toContain('import { SelectionAssistSurface } from "./selection-assist/SelectionAssistSurface"');
    expect(pdfCard).toContain('import { SelectionAssistSurface } from "../selection-assist/SelectionAssistSurface"');
    expect(reader).toContain("selectionAssistAnchorFromRange");
    expect(pdfReader).toContain("selectionAssistAnchorFromRects");
    expect(shared).toContain("useSelectionAssistSurface");
    expect(pdfCard).not.toContain("useEffect");
    expect(pdfCard).not.toContain("card.style.");
    expect(pdfCard).not.toContain("visualViewport");
  });


  it("uses one 420px wide shell and preserves wide nonmodal focus semantics", () => {
    expect(shared).toContain("width = 420");
    expect(reader).not.toMatch(/<SelectionAssistSurface[\s\S]*?width=\{/);
    expect(pdfCard).not.toMatch(/<SelectionAssistSurface[\s\S]*?width=\{/);
    expect(shared).toContain('aria-modal={compact ? true : undefined}');
    expect(shared).toContain('aria-hidden="true"');
    expect(shared).toContain("(!compact && !focusOnOpen)");
    expect(hook).toContain("viewport.width <= compactBreakpoint");
  });

  it("carries the saved Dawn reader theme into the PDF shell", () => {
    expect(pdfReader).toContain("loadReaderSettings");
    expect(pdfReader).toContain("reader-theme-${selectionAssistTheme}");
    expect(css).toContain(".dawn-pdf-reader-shell.reader-theme-night .selection-assist-surface");
  });

  it("keeps only format capabilities different inside the shared shell", () => {
    expect(reader).toContain("中文详解");
    expect(reader).toContain("chat-compose");
    expect(reader).toContain("chat-sources");
    expect(pdfCard).toContain("pdf-highlight-action");
    expect(pdfCard).toContain("重试中文");
    expect(pdfCard).toContain('title="黄色标记"');
    expect(pdfCard).toContain('aria-label="用黄色标记所选文字"');
    expect(pdfCard).toContain("highlightState.phase");
  });

  it("uses body-only scroll, 44px controls, reduced motion, and an explicit compact sheet", () => {
    expect(css).toMatch(/\.selection-assist-surface\s*\{[\s\S]*?overflow:\s*hidden;/);
    expect(css).toMatch(/\.selection-assist-body\s*\{[\s\S]*?overflow-y:\s*auto;/);
    expect(css).toMatch(/min-height:\s*44px/);
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(shared).toContain('aria-modal={compact ? true : undefined}');
    expect(shared).toContain('aria-hidden="true"');
  });

  it("shares one title-bar drag behavior while preserving action controls", () => {
    expect(shared).toContain("data-selection-assist-drag-handle");
    expect(shared).toContain('event.pointerType !== "mouse"');
    expect(shared).toContain('.closest(".selection-assist-actions")');
    expect(css).toMatch(/\.selection-assist-header\s*\{[\s\S]*?cursor:\s*grab;/);
    expect(css).toContain('[data-dragging="true"]');
  });
});
