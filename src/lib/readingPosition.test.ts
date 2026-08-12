import { describe, expect, it } from "vitest";
import { parseReadingPosition } from "./readingPosition";

describe("reading position", () => {
  it("keeps compatibility with percentage-only bookmarks", () => {
    expect(parseReadingPosition("42")).toEqual({ cfi: null, percentage: 42 });
  });

  it("loads an exact EPUB location", () => {
    expect(parseReadingPosition('{"cfi":"epubcfi(/6/4)","percentage":63}')).toEqual({
      cfi: "epubcfi(/6/4)",
      percentage: 63,
    });
  });

  it("keeps the timestamp used to resolve cross-device changes", () => {
    expect(parseReadingPosition('{"cfi":"epubcfi(/6/8)","percentage":68,"updatedAt":"2026-08-10T07:00:00.000Z"}')).toEqual({
      cfi: "epubcfi(/6/8)",
      percentage: 68,
      updatedAt: "2026-08-10T07:00:00.000Z",
    });
  });

  it("rejects invalid stored values", () => {
    expect(parseReadingPosition("not-json")).toBeNull();
    expect(parseReadingPosition('{"percentage":120}')).toBeNull();
  });
});
