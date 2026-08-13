import { describe, expect, it } from "vitest";
import {
  pageTurnFromKey,
  pageTurnFromPointer,
  pointerInputKind,
  shouldTurnPage,
  touchInputKind,
} from "./pencilInput";

describe("Pencil input", () => {
  it("uses taps and swipes to choose the page direction", () => {
    expect(pageTurnFromPointer(100, 100, 100, 100, 800)).toBe("prev");
    expect(pageTurnFromPointer(700, 100, 700, 100, 800)).toBe("next");
    expect(pageTurnFromPointer(500, 100, 570, 102, 800)).toBe("prev");
    expect(pageTurnFromPointer(500, 100, 430, 102, 800)).toBe("next");
    expect(pageTurnFromPointer(500, 100, 508, 180, 800)).toBeNull();
    expect(pageTurnFromPointer(1500, 100, 1500, 100, 800)).toBe("next");
  });

  it("recognizes Safari stylus touches and routes page gestures", () => {
    expect(pointerInputKind("pen")).toBe("pen");
    expect(touchInputKind("stylus")).toBe("pen");
    expect(touchInputKind("direct")).toBe("touch");
    expect(shouldTurnPage("pen", "page")).toBe(true);
    expect(shouldTurnPage("pen", "select")).toBe(false);
    expect(shouldTurnPage("touch", "select")).toBe(true);
    expect(shouldTurnPage("mouse", "page")).toBe(false);
  });

  it("maps desktop arrow keys without claiming unrelated keys", () => {
    expect(pageTurnFromKey("ArrowLeft")).toBe("prev");
    expect(pageTurnFromKey("ArrowRight")).toBe("next");
    expect(pageTurnFromKey("Enter")).toBeNull();
  });
});
