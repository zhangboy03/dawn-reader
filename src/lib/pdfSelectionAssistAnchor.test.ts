import { describe, expect, it } from "vitest";
import { selectionAssistAnchorFromPdfQuads } from "./pdfSelectionAssistAnchor";

function viewport(scale: number) {
  return {
    width: 600 * scale,
    height: 800 * scale,
    convertToViewportPoint: (x: number, y: number): [number, number] => [x * scale, y * scale],
  };
}

const quads = [
  { x1: 40, y1: 80, x2: 220, y2: 100 },
  { x1: 300, y1: 140, x2: 520, y2: 162 },
];

describe("PDF selection-assistance quad reprojection", () => {
  it("tracks PDF scrolling without collapsing fragments to a page union", () => {
    const first = selectionAssistAnchorFromPdfQuads({
      quads,
      viewport: viewport(1),
      pageRect: { left: 100, top: 200, width: 600, height: 800 },
      focusIndex: 1,
      direction: "forward",
      visibleBounds: { left: 0, top: 0, right: 1000, bottom: 900 },
    });
    const scrolled = selectionAssistAnchorFromPdfQuads({
      quads,
      viewport: viewport(1),
      pageRect: { left: 100, top: 80, width: 600, height: 800 },
      focusIndex: 1,
      direction: "forward",
      visibleBounds: { left: 0, top: 0, right: 1000, bottom: 900 },
    });
    expect(first?.focusIndex).toBe(1);
    expect(first?.focusRect.top).toBe(340);
    expect(scrolled?.focusRect.top).toBe(220);
    expect(scrolled!.focusRect.top - first!.focusRect.top).toBe(-120);
  });

  it("tracks current PDF zoom/viewport geometry while retaining the logical endpoint", () => {
    const normal = selectionAssistAnchorFromPdfQuads({
      quads,
      viewport: viewport(1),
      pageRect: { left: 100, top: 100, width: 600, height: 800 },
      focusIndex: 1,
      direction: "forward",
    });
    const zoomed = selectionAssistAnchorFromPdfQuads({
      quads,
      viewport: viewport(2),
      pageRect: { left: 60, top: 40, width: 1200, height: 1600 },
      focusIndex: 1,
      direction: "forward",
    });
    expect(normal?.focusRect).toMatchObject({ left: 400, top: 240, right: 620, bottom: 262 });
    expect(zoomed?.focusRect).toMatchObject({ left: 660, top: 320, right: 1100, bottom: 364 });
    expect(zoomed?.focusIndex).toBe(1);
  });

  it("moves to the nearest visible fragment when the saved focus fragment scrolls offscreen", () => {
    const anchor = selectionAssistAnchorFromPdfQuads({
      quads,
      viewport: viewport(1),
      pageRect: { left: 100, top: -120, width: 600, height: 800 },
      focusIndex: 0,
      direction: "forward",
      visibleBounds: { left: 0, top: 0, right: 1000, bottom: 500 },
    });
    expect(anchor?.rects).toHaveLength(1);
    expect(anchor?.focusRect).toMatchObject({ left: 400, top: 20, right: 620, bottom: 42 });
  });
});
