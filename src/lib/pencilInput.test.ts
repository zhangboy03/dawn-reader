import { describe, expect, it } from "vitest";
import { nextPencilMode, pageTurnFromPointer } from "./pencilInput";

describe("Pencil input", () => {
  it("toggles between page and selection modes", () => {
    expect(nextPencilMode("page")).toBe("select");
    expect(nextPencilMode("select")).toBe("page");
  });

  it("uses taps and swipes to choose the page direction", () => {
    expect(pageTurnFromPointer(100, 100, 800)).toBe("prev");
    expect(pageTurnFromPointer(700, 700, 800)).toBe("next");
    expect(pageTurnFromPointer(500, 570, 800)).toBe("prev");
    expect(pageTurnFromPointer(500, 430, 800)).toBe("next");
  });
});
