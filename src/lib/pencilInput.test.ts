import { describe, expect, it } from "vitest";
import {
  desktopPageTurnFromPointer,
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

  it("turns desktop pages only from blank edge clicks or blank horizontal drags", () => {
    const gesture = { startX: 100, startY: 200, endX: 100, endY: 200, width: 1000, startedOnBlank: true, hasSelection: false };
    expect(desktopPageTurnFromPointer(gesture)).toBe("prev");
    expect(desktopPageTurnFromPointer({ ...gesture, startX: 800, endX: 800 })).toBe("next");
    expect(desktopPageTurnFromPointer({ ...gesture, startX: 500, endX: 500 })).toBeNull();
    expect(desktopPageTurnFromPointer({ ...gesture, startX: 500, endX: 430 })).toBe("next");
    expect(desktopPageTurnFromPointer({ ...gesture, startX: 500, endX: 570 })).toBe("prev");
    expect(desktopPageTurnFromPointer({ ...gesture, startedOnBlank: false })).toBeNull();
    expect(desktopPageTurnFromPointer({ ...gesture, hasSelection: true })).toBeNull();
    expect(desktopPageTurnFromPointer({ ...gesture, startX: 100, endX: 105, endY: 250 })).toBeNull();
  });
});
