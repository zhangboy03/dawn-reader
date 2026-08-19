import { describe, expect, it } from "vitest";
import {
  epubLocationCacheKey,
  epubRestoreDirection,
  pageNumberFromLocation,
  parseCachedEpubLocations,
  publisherPageNumber,
  saveCachedEpubLocations,
} from "./epubPagination";

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

describe("EPUB location cache", () => {
  const locations = ["epubcfi(/6/2)", "epubcfi(/6/4)"];

  it("keeps generated locations under a content-specific versioned key", () => {
    const values = new Map<string, string>();
    const storage = { setItem: (key: string, value: string) => values.set(key, value) };

    expect(saveCachedEpubLocations("sha256:book", locations, storage)).toBe(true);
    expect(values.get(epubLocationCacheKey("sha256:book"))).toBe(JSON.stringify(locations));
  });

  it("rejects malformed cached locations", () => {
    expect(parseCachedEpubLocations(JSON.stringify(locations))).toEqual(locations);
    expect(parseCachedEpubLocations('["not-a-cfi"]')).toBeNull();
    expect(parseCachedEpubLocations("not-json")).toBeNull();
  });
});

describe("EPUB restore direction", () => {
  it("moves until the visible location matches the saved location", () => {
    expect(epubRestoreDirection(26, 19)).toBe("next");
    expect(epubRestoreDirection(26, 31)).toBe("prev");
    expect(epubRestoreDirection(26, 26)).toBeNull();
  });
});
