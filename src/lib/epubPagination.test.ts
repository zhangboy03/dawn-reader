import { describe, expect, it } from "vitest";
import { pageNumberFromLocation, publisherPageNumber } from "./epubPagination";

describe("EPUB page numbers", () => {
  it("turns zero-based generated locations into reader-facing pages", () => {
    expect(pageNumberFromLocation(0, 199)).toEqual({ current: 1, total: 200, source: "generated" });
    expect(pageNumberFromLocation(84, 199)).toEqual({ current: 85, total: 200, source: "generated" });
    expect(pageNumberFromLocation(240, 199)).toEqual({ current: 200, total: 200, source: "generated" });
  });

  it("prefers valid publisher page-list values", () => {
    expect(publisherPageNumber(37, 412)).toEqual({ current: 37, total: 412, source: "publisher" });
    expect(publisherPageNumber(-1, 412)).toBeNull();
    expect(pageNumberFromLocation(-1, 199)).toBeNull();
  });
});
