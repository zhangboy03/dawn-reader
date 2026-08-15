import { describe, expect, it } from "vitest";
import {
  epubFrameSize,
  epubReflowAction,
  mergeEpubReflowRequest,
  type EpubReflowRequest,
} from "./epubReflow";

const request = (overrides: Partial<EpubReflowRequest> = {}): EpubReflowRequest => ({
  anchor: "epubcfi(/6/2!/4/2)",
  appearance: false,
  content: false,
  appearanceRevision: 0,
  contentRevision: 0,
  revision: 1,
  ...overrides,
});

describe("mergeEpubReflowRequest", () => {
  it("retains the first visual anchor while coalescing a burst", () => {
    expect(mergeEpubReflowRequest(
      request({ anchor: "first", revision: 3 }),
      request({ anchor: "later", appearance: true, appearanceRevision: 4, revision: 4 }),
    )).toEqual({
      anchor: "first",
      appearance: true,
      content: false,
      appearanceRevision: 4,
      contentRevision: 0,
      revision: 4,
    });
  });

  it("uses a later anchor only when the queued request has none", () => {
    expect(mergeEpubReflowRequest(
      request({ anchor: null }),
      request({ anchor: "visible" }),
    ).anchor).toBe("visible");
  });
});

describe("epubReflowAction", () => {
  it("lets EPUB.js own a real frame resize", () => {
    expect(epubReflowAction(request(), { width: 760, height: 600 }, { width: 980, height: 600 }))
      .toBe("resize");
  });

  it("redisplays once for an appearance-only change", () => {
    expect(epubReflowAction(
      request({ appearance: true }),
      { width: 760, height: 600 },
      { width: 760, height: 600 },
    )).toBe("redisplay");
  });

  it("redisplays a same-size frame after intrinsic media layout changes", () => {
    expect(epubReflowAction(
      request({ content: true, contentRevision: 2 }),
      { width: 760, height: 600 },
      { width: 760, height: 600 },
    )).toBe("redisplay");
  });

  it("does nothing for sub-pixel observer noise", () => {
    expect(epubReflowAction(request(), { width: 760, height: 600 }, { width: 761, height: 599 }))
      .toBe("none");
  });
});

describe("epubFrameSize", () => {
  it("rejects collapsed frames and normalizes usable dimensions", () => {
    expect(epubFrameSize({ width: 0, height: 600 })).toBeNull();
    expect(epubFrameSize({ width: 760.9, height: 600.8 })).toEqual({ width: 760, height: 600 });
  });
});
