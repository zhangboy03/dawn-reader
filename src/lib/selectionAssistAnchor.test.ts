// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  normalizedSelectionAssistRects,
  selectionAssistAnchorFromRange,
  selectionAssistAnchorFromRects,
  selectionAssistDirection,
  type SelectionAssistRect,
} from "./selectionAssistAnchor";

function rect(left: number, top: number, width: number, height = 20) {
  return { left, top, right: left + width, bottom: top + height, width, height } as DOMRect;
}

function rangeWithRects(rects: DOMRect[], bounding = rect(0, 0, 1000, 700)) {
  const host = document.createElement("p");
  host.textContent = "selection geometry";
  document.body.appendChild(host);
  const range = document.createRange();
  range.selectNodeContents(host);
  Object.defineProperties(range, {
    getClientRects: { value: () => rects },
    getBoundingClientRect: { value: () => bounding },
  });
  return range;
}

describe("selection assist client-rect anchors", () => {
  it("anchors a forward multicolumn selection to the actual focus fragment, never its union", () => {
    const first = rect(90, 620, 310);
    const focus = rect(640, 88, 280);
    const range = rangeWithRects([first, focus], rect(90, 88, 830, 552));

    const anchor = selectionAssistAnchorFromRange(range, {
      direction: "forward",
      visibleBounds: { left: 0, top: 0, right: 1100, bottom: 760 },
    });

    expect(anchor?.focusRect).toEqual(expect.objectContaining({ left: 640, top: 88, right: 920, bottom: 108 }));
    expect(anchor?.focusRect).not.toEqual(expect.objectContaining({ left: 90, top: 88, right: 920, bottom: 640 }));
    expect(anchor?.focusIndex).toBe(1);
    expect(anchor?.strategy).toBe("direction");
  });

  it("uses the first real fragment for a backward selection", () => {
    const anchor = selectionAssistAnchorFromRects([
      rect(80, 600, 260),
      rect(620, 80, 250),
    ], { direction: "backward" });
    expect(anchor?.focusIndex).toBe(0);
    expect(anchor?.focusRect.left).toBe(80);
  });

  it("chooses the rect nearest the final pointer endpoint in either drag direction", () => {
    const rects = [rect(80, 600, 260), rect(620, 80, 250)];
    expect(selectionAssistAnchorFromRects(rects, {
      direction: "forward",
      endpoint: { x: 110, y: 610 },
    })?.focusIndex).toBe(0);
    expect(selectionAssistAnchorFromRects(rects, {
      direction: "backward",
      endpoint: { x: 850, y: 88 },
    })?.focusIndex).toBe(1);
  });

  it("translates and scales iframe-local rects and endpoints into the host viewport", () => {
    const anchor = selectionAssistAnchorFromRects([rect(20, 30, 90)], {
      direction: "forward",
      offset: { x: 400, y: 120 },
      scale: { x: 0.5, y: 0.5 },
      endpoint: { x: 450, y: 142 },
      visibleBounds: { left: 400, top: 120, right: 800, bottom: 700 },
    });
    expect(anchor?.focusRect).toMatchObject({ left: 410, top: 135, right: 455, bottom: 145 });
    expect(anchor?.focusPoint).toEqual({ x: 450, y: 142 });
  });

  it("filters zero, duplicate, offscreen, and tall union-like noise without reordering valid lines", () => {
    const valid = [rect(20, 20, 180), rect(20, 48, 160)];
    const normalized = normalizedSelectionAssistRects([
      rect(0, 0, 0, 0),
      valid[0],
      valid[0],
      rect(-500, -500, 30),
      rect(0, 0, 900, 500),
      valid[1],
    ], { visibleBounds: { left: 0, top: 0, right: 400, bottom: 300 } });
    expect(normalized).toEqual<SelectionAssistRect[]>([
      expect.objectContaining({ left: 20, top: 20, width: 180 }),
      expect.objectContaining({ left: 20, top: 48, width: 160 }),
    ]);
  });

  it("rejects a huge bounding-union fallback when no real client fragment survives", () => {
    const range = rangeWithRects([], rect(0, 0, 1000, 620));
    Object.defineProperty(range, "cloneRange", {
      value: () => ({
        collapse: () => undefined,
        getClientRects: () => [],
        getBoundingClientRect: () => rect(0, 0, 1000, 620),
      }),
    });
    expect(selectionAssistAnchorFromRange(range, {
      direction: "forward",
      visibleBounds: { left: 0, top: 0, right: 1000, bottom: 700 },
    })).toBeNull();
  });

  it("derives keyboard focus direction when the browser does not expose Selection.direction", () => {
    const host = document.createTextNode("abcdef");
    document.body.appendChild(host);
    const forward = {
      anchorNode: host,
      anchorOffset: 1,
      focusNode: host,
      focusOffset: 5,
    } as unknown as Selection;
    const backward = { ...forward, anchorOffset: 5, focusOffset: 1 } as unknown as Selection;
    expect(selectionAssistDirection(forward)).toBe("forward");
    expect(selectionAssistDirection(backward)).toBe("backward");
  });
});
