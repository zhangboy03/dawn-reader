import { describe, expect, it } from "vitest";
import { selectionAssistPosition } from "./selectionAssistPosition";

describe("selectionAssistPosition", () => {
  it("moves below a high selection when the full card cannot fit above it", () => {
    expect(selectionAssistPosition({
      anchor: { x: 520, top: 260, bottom: 292 },
      popover: { width: 390, height: 420 },
      viewport: { width: 1280, height: 928 },
      safeArea: { top: 76, bottom: 854 },
    })).toEqual({
      left: 520,
      top: 304,
      maxHeight: 550,
      placement: "below",
    });
  });

  it("keeps the card above when it fits there", () => {
    expect(selectionAssistPosition({
      anchor: { x: 700, top: 650, bottom: 680 },
      popover: { width: 390, height: 320 },
      viewport: { width: 1280, height: 900 },
      safeArea: { top: 76, bottom: 826 },
    })).toMatchObject({
      top: 638,
      maxHeight: 562,
      placement: "above",
    });
  });

  it("uses the roomier side and constrains the card when neither side fully fits", () => {
    expect(selectionAssistPosition({
      anchor: { x: 500, top: 360, bottom: 390 },
      popover: { width: 430, height: 540 },
      viewport: { width: 1000, height: 700 },
      safeArea: { top: 70, bottom: 640 },
    })).toMatchObject({
      top: 348,
      maxHeight: 278,
      placement: "above",
    });
  });

  it("keeps the full card inside the horizontal viewport", () => {
    expect(selectionAssistPosition({
      anchor: { x: 20, top: 500, bottom: 530 },
      popover: { width: 430, height: 200 },
      viewport: { width: 1000, height: 700 },
      safeArea: { top: 70, bottom: 640 },
    }).left).toBe(231);
  });
});
