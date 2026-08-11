import { describe, expect, it } from "vitest";
import { isSingleWord } from "../lib/selectionKind";
import { selectionPrompt, stripThinking } from "./aiPrompt";

describe("selection AI prompt", () => {
  it("keeps selected content separate from nearby context", () => {
    const prompt = selectionPrompt({
      text: "selected sentence",
      context: { before: "before", after: "after" },
      bookTitle: "Book",
    });
    expect(prompt.user).toContain("<selection>\nselected sentence\n</selection>");
    expect(prompt.user).toContain("<context_before>\nbefore\n</context_before>");
  });

  it("explains one word with IPA instead of rewriting its paragraph", () => {
    const prompt = selectionPrompt({ text: "self-reliance", context: { before: "his", after: "mattered" } });
    expect(isSingleWord("self-reliance")).toBe(true);
    expect(isSingleWord("a difficult phrase")).toBe(false);
    expect(prompt.maxTokens).toBe(48);
    expect(prompt.system).toContain("selected word /IPA/");
    expect(prompt.system).toContain("Never rewrite, summarize, or quote the surrounding");
  });

  it("rewrites passages at the selected support level", () => {
    const prompt = selectionPrompt({ text: "a difficult phrase", preset: "supportive" });
    expect(prompt.maxTokens).toBe(96);
    expect(prompt.system).toContain("clear A2 English");
    expect(prompt.system).toContain("Rewrite only the text inside <selection>");
  });

  it("gives contextual Chinese detail for a word", () => {
    const prompt = selectionPrompt({ text: "quality", mode: "chinese" });
    expect(prompt.maxTokens).toBe(320);
    expect(prompt.system).toContain("standard IPA pronunciation");
    expect(prompt.system).toContain("Never translate or summarize the surrounding");
  });

  it("translates and then explains a selected passage in Chinese", () => {
    const prompt = selectionPrompt({ text: "a difficult passage", mode: "chinese" });
    expect(prompt.system).toContain("First give an accurate, natural Chinese translation");
    expect(prompt.system).toContain("翻译：");
    expect(prompt.system).toContain("解释：");
  });

  it("removes hidden reasoning blocks from provider output", () => {
    expect(stripThinking("<think>private analysis</think>final answer")).toBe("final answer");
  });
});
