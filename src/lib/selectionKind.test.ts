import { describe, expect, it } from "vitest";
import { isSingleWord } from "./selectionKind";

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
});
