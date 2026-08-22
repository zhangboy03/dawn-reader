import { describe, expect, it } from "vitest";
import type { SelectionAssistAnchor } from "./selectionAssistAnchor";
import {
  clampSelectionAssistDragPosition,
  selectionAssistPosition,
  selectionAssistPositionEqual,
  visualViewportRect,
} from "./selectionAssistPosition";

function anchor(left: number, top: number, width = 120, height = 24): SelectionAssistAnchor {
  const focusRect = { left, top, right: left + width, bottom: top + height, width, height };
  return {
    rects: [focusRect],
    focusRect,
    focusPoint: { x: left + width / 2, y: top + height / 2 },
    focusIndex: 0,
    direction: "forward",
    strategy: "direction",
  };
}

function place(input: Partial<Parameters<typeof selectionAssistPosition>[0]> = {}) {
  return selectionAssistPosition({
    anchor: anchor(460, 420),
    popover: { width: 390, naturalHeight: 320 },
    viewport: { left: 0, top: 0, width: 1000, height: 700 },
    safeArea: { left: 0, top: 70, right: 1000, bottom: 640 },
    ...input,
  });
}

describe("selectionAssistPosition", () => {
  it("lets a dragged surface use the whole safe viewport without becoming unreachable", () => {
    const viewport = { left: 0, top: 0, width: 1000, height: 700 };
    const safeArea = { left: 0, top: 64, right: 1000, bottom: 680 };
    expect(clampSelectionAssistDragPosition({
      position: { left: 2000, top: 2000 },
      surface: { width: 420, height: 240 },
      viewport,
      safeArea,
    })).toEqual({ left: 568, top: 428 });
    expect(clampSelectionAssistDragPosition({
      position: { left: -200, top: -200 },
      surface: { width: 420, height: 240 },
      viewport,
      safeArea,
    })).toEqual({ left: 12, top: 76 });
  });

  it("places a useful card below when the preferred upper side cannot meet its useful height", () => {
    const result = place({
      anchor: anchor(460, 220),
      popover: { width: 390, naturalHeight: 420 },
    });
    expect(result).toMatchObject({ placement: "below", strategy: "adjacent", top: 256, maxHeight: 372 });
  });

  it("places the card outside the connected multi-line selection instead of covering earlier selected lines", () => {
    const multiLine = anchor(460, 120);
    multiLine.rects = [
      multiLine.focusRect,
      { left: 420, top: 150, right: 720, bottom: 174, width: 300, height: 24 },
      { left: 420, top: 180, right: 650, bottom: 204, width: 230, height: 24 },
    ];
    const result = place({
      anchor: multiLine,
      popover: { width: 390, naturalHeight: 120 },
    });
    expect(result).toMatchObject({ placement: "below", top: 216 });
  });

  it("does not let a disconnected column fragment pull the card away from the endpoint block", () => {
    const endpoint = anchor(640, 120, 240, 20);
    endpoint.rects = [
      endpoint.focusRect,
      { left: 80, top: 520, right: 360, bottom: 540, width: 280, height: 20 },
    ];
    const result = place({ anchor: endpoint, popover: { width: 390, naturalHeight: 120 } });
    expect(result).toMatchObject({ placement: "below", top: 152 });
  });

  it("keeps an actual multicolumn endpoint anchor above instead of using the disconnected union", () => {
    const endpoint = anchor(640, 88, 280, 20);
    const result = place({
      anchor: endpoint,
      viewport: { left: 0, top: 0, width: 1100, height: 760 },
      safeArea: { left: 0, top: 64, right: 1100, bottom: 710 },
      popover: { width: 390, naturalHeight: 260 },
    });
    expect(result.placement).toBe("below");
    expect(result.top).toBe(120);
    expect(result.left).toBeGreaterThanOrEqual(16);
  });

  it("uses an explicit edge-safe panel when neither adjacent side is useful", () => {
    const result = place({
      anchor: anchor(450, 343, 120, 24),
      popover: { width: 430, naturalHeight: 540 },
      minimumUsefulHeight: 260,
      maximumHeight: 540,
    });
    expect(result).toMatchObject({ placement: "panel", strategy: "edge-panel", top: 82, height: 540, maxHeight: 540 });
  });

  it("uses visualViewport offset and keyboard-reduced height for the compact sheet", () => {
    const viewport = visualViewportRect({ offsetLeft: 0, offsetTop: 248, width: 390, height: 480 } as VisualViewport, {
      width: 390,
      height: 844,
    });
    const result = place({
      anchor: anchor(120, 500),
      viewport,
      safeArea: { left: 0, top: 248, right: 390, bottom: 728 },
      compact: true,
      popover: { width: 430, naturalHeight: 620 },
      maximumHeight: 620,
    });
    expect(result).toMatchObject({ placement: "sheet", strategy: "compact-sheet", top: 260, maxHeight: 456, height: 456 });
    expect(result.left).toBe(28);
    expect(result.width).toBe(334);
  });

  it("keeps short results adjacent instead of forcing a full-height takeover", () => {
    const result = place({
      anchor: anchor(440, 360),
      popover: { width: 390, naturalHeight: 92 },
      minimumUsefulHeight: 184,
    });
    expect(result.strategy).toBe("adjacent");
    expect(result.height).toBe(92);
  });

  it("turns an oversized focus rect into a deliberate panel rather than a tiny strip", () => {
    const huge = anchor(-20, 40, 1100, 620);
    const result = place({ anchor: huge, popover: { width: 430, naturalHeight: 500 } });
    expect(result.placement).toBe("panel");
    expect(result.maxHeight).toBeGreaterThanOrEqual(500);
  });

  it("keeps the six acceptance viewports and every edge/corner inside safe bounds", () => {
    const sizes = [
      [320, 568], [390, 844], [768, 1024], [1024, 768], [1366, 768], [2340, 1864],
    ] as const;
    for (const [width, height] of sizes) {
      const safe = { left: 0, top: 60, right: width, bottom: height - 54 };
      const positions = [
        [0, safe.top], [width - 20, safe.top], [0, safe.bottom - 24], [width - 20, safe.bottom - 24],
        [width / 2, safe.top], [width / 2, safe.bottom - 24],
        [0, (safe.top + safe.bottom) / 2], [width - 20, (safe.top + safe.bottom) / 2],
      ];
      for (const [left, top] of positions) {
        const result = selectionAssistPosition({
          anchor: anchor(left, top, 20, 24),
          popover: { width: 430, naturalHeight: 600 },
          viewport: { left: 0, top: 0, width, height },
          safeArea: safe,
          compact: width <= 720,
          maximumHeight: 620,
          minimumUsefulHeight: 220,
        });
        expect(result.left).toBeGreaterThanOrEqual(12);
        expect(result.top).toBeGreaterThanOrEqual(72);
        expect(result.left + result.width).toBeLessThanOrEqual(width - 12);
        expect(result.top + result.height).toBeLessThanOrEqual(height - 66);
        expect(result.height).toBeGreaterThan(0);
      }
    }
  });

  it("treats sub-pixel recomputation as stable to resist observer feedback loops", () => {
    const first = place();
    const second = { ...first, left: first.left + 0.1, top: first.top - 0.1, maxHeight: first.maxHeight + 0.1 };
    expect(selectionAssistPositionEqual(first, second)).toBe(true);
  });
});
