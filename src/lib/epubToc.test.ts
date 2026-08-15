import { describe, expect, it } from "vitest";
import { normalizeEpubToc, tocHrefKey, tocItemIsCurrent } from "./epubToc";

describe("EPUB table of contents", () => {
  it("keeps valid nested entries and cleans their labels", () => {
    expect(normalizeEpubToc([{
      label: " Part I  ",
      href: "Text/part-1.xhtml",
      subitems: [{ label: "Chapter\nOne", href: "Text/chapter-1.xhtml#start" }],
    }, { label: "", href: "missing-title.xhtml" }])).toEqual([{
      id: "toc-0",
      label: "Part I",
      href: "Text/part-1.xhtml",
      subitems: [{
        id: "toc-0-0",
        label: "Chapter One",
        href: "Text/chapter-1.xhtml#start",
        subitems: [],
      }],
    }]);
  });

  it("matches a chapter even when navigation adds a fragment or relative prefix", () => {
    expect(tocHrefKey("../Text/Chapter%201.xhtml#section-2")).toBe("Text/Chapter 1.xhtml");
    expect(tocItemIsCurrent("../Text/Chapter%201.xhtml#section-2", "Text/Chapter 1.xhtml")).toBe(true);
  });
});
