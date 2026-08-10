import { describe, expect, it } from "vitest";
import {
  nextPencilMode,
  pageTurnFromPointer,
  pointerInputKind,
  shouldCaptureSelection,
  shouldTurnPage,
  touchInputKind,
} from "./pencilInput";

describe("Pencil input", () => {
  it("toggles between page and selection modes", () => {
    expect(nextPencilMode("page")).toBe("select");
    expect(nextPencilMode("select")).toBe("page");
  });

  it("uses taps and swipes to choose the page direction", () => {
    expect(pageTurnFromPointer(100, 100, 100, 100, 800)).toBe("prev");
    expect(pageTurnFromPointer(700, 100, 700, 100, 800)).toBe("next");
    expect(pageTurnFromPointer(500, 100, 570, 102, 800)).toBe("prev");
    expect(pageTurnFromPointer(500, 100, 430, 102, 800)).toBe("next");
    expect(pageTurnFromPointer(500, 100, 508, 180, 800)).toBeNull();
    expect(pageTurnFromPointer(1500, 100, 1500, 100, 800)).toBe("next");
  });

  it("recognizes Safari stylus touches and routes both reader modes", () => {
    expect(pointerInputKind("pen")).toBe("pen");
    expect(touchInputKind("stylus")).toBe("pen");
    expect(touchInputKind("direct")).toBe("touch");
    expect(shouldTurnPage("pen", "page")).toBe(true);
    expect(shouldTurnPage("pen", "select")).toBe(false);
    expect(shouldTurnPage("touch", "select")).toBe(true);
    expect(shouldCaptureSelection("pen", "select")).toBe(true);
    expect(shouldCaptureSelection("pen", "page")).toBe(false);
  });
});
