import { describe, expect, it } from "vitest";
import { isSingleWord, selectionKind } from "./selectionKind";

describe("selection kind", () => {
  it.each([
    ["quality", true],
    ["self-reliance", true],
    ["“quality”", true],
    ["can't", true],
    ["2026", false],
    ["quality work", false],
  ])("classifies %s", (text, expected) => {
    expect(isSingleWord(text)).toBe(expected);
  });

  it.each([
    ["quality", "word"],
    ["in light of", "phrase"],
    ["the quality of mind needed to win", "phrase"],
    ["He left because it was late.", "passage"],
    ["This selected passage contains more than eight separate words", "passage"],
  ])("classifies %s as a %s selection", (text, expected) => {
    expect(selectionKind(text)).toBe(expected);
  });
});
