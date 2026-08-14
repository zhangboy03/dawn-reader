import { describe, expect, it } from "vitest";
import { restoredScrollTop, visualAnchorPoints } from "./readingAnchor";

describe("visualAnchorPoints", () => {
  it("starts at the visual center and then probes both reading columns", () => {
    const points = visualAnchorPoints({ left: 100, top: 50, width: 1000, height: 600 });
    expect(points.slice(0, 3)).toEqual([
      { x: 600, y: 326 },
      { x: 380, y: 326 },
      { x: 820, y: 326 },
    ]);
  });
});

describe("restoredScrollTop", () => {
  it("offsets the scroll position by the anchor's layout shift", () => {
    expect(restoredScrollTop(900, 360, 510, 2400)).toBe(1050);
  });

  it("clamps the correction to the scrollable range", () => {
    expect(restoredScrollTop(40, 500, 100, 2400)).toBe(0);
    expect(restoredScrollTop(2300, 100, 400, 2400)).toBe(2400);
  });
});
