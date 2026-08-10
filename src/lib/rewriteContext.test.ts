import { describe, expect, it } from "vitest";
import { contextFromParagraphs } from "./rewriteContext";

describe("rewrite context", () => {
  it("keeps the selected passage separate from nearby context", () => {
    const paragraphs = [
      "The road climbed into the mountains.",
      "It was difficult to see why this mattered at first.",
      "Later, the reason became clear.",
    ];

    expect(contextFromParagraphs(paragraphs, 1, "difficult to see why this mattered")).toEqual({
      before: "The road climbed into the mountains. It was",
      after: "at first. Later, the reason became clear.",
    });
  });

  it("caps both sides of the context window", () => {
    const result = contextFromParagraphs(["abcdefgh", "selected", "ijklmnop"], 1, "selected", 4);
    expect(result).toEqual({ before: "efgh", after: "ijkl" });
  });
});
