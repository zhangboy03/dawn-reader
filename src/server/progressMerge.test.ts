import { describe, expect, it } from "vitest";
import { mergeProgressLocators } from "./progressMerge";

describe("cross-platform progress locator merge", () => {
  const existing = { cfi: "epubcfi(/6/4)", nativeLocator: '{"href":"chapter.xhtml"}' };

  it("lets Web update CFI without erasing the native locator", () => {
    expect(mergeProgressLocators(existing, { cfi: "epubcfi(/6/8)" })).toEqual({
      cfi: "epubcfi(/6/8)",
      nativeLocator: existing.nativeLocator,
    });
  });

  it("lets Readium update its locator without erasing Web CFI", () => {
    expect(mergeProgressLocators(existing, { nativeLocator: '{"href":"next.xhtml"}' })).toEqual({
      cfi: existing.cfi,
      nativeLocator: '{"href":"next.xhtml"}',
    });
  });

  it("clears a locator only when the client sends null explicitly", () => {
    expect(mergeProgressLocators(existing, { cfi: null })).toEqual({
      cfi: null,
      nativeLocator: existing.nativeLocator,
    });
  });
});
