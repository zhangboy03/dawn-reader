import { describe, expect, it } from "vitest";
import {
  latestReadingPosition,
  parseReadingPosition,
  positionAfterPagination,
} from "./readingPosition";

describe("latestReadingPosition", () => {
  const local = { cfi: "epubcfi(/6/4)", percentage: 40, updatedAt: "2026-08-18T08:00:00.000Z" };
  const cloud = { cfi: "epubcfi(/6/8)", percentage: 80, updatedAt: "2026-08-18T09:00:00.000Z" };

  it("uses the cloud position before first paint when it is newer", () => {
    expect(latestReadingPosition(local, cloud)).toBe(cloud);
  });

  it("keeps the local position when it is current", () => {
    expect(latestReadingPosition(cloud, local)).toBe(cloud);
    expect(latestReadingPosition(local, { ...cloud, updatedAt: local.updatedAt })).toBe(local);
  });

  it("supports one-sided and legacy positions", () => {
    expect(latestReadingPosition(local, null)).toBe(local);
    expect(latestReadingPosition(null, cloud)).toBe(cloud);
    expect(latestReadingPosition({ cfi: null, percentage: 25 }, cloud)).toBe(cloud);
  });
});

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

describe("positionAfterPagination", () => {
  const restored = {
    cfi: "epubcfi(/6/20)",
    percentage: 20,
    updatedAt: "2026-08-19T00:00:00.000Z",
  };

  it("keeps the restored timestamp when pagination only normalizes the current page", () => {
    expect(positionAfterPagination(restored, "epubcfi(/6/20!/4/2)", 20, false)).toEqual({
      cfi: "epubcfi(/6/20!/4/2)",
      percentage: 20,
      updatedAt: restored.updatedAt,
    });
  });

  it("treats navigation during pagination as a new reading position", () => {
    expect(positionAfterPagination(restored, "epubcfi(/6/25)", 25, true)).toEqual({
      cfi: "epubcfi(/6/25)",
      percentage: 25,
    });
  });
});
