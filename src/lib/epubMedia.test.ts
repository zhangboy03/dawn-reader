import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { isEpubMediaControlTarget, isHlsSource, prepareEpubMediaDocument } from "./epubMedia";

describe("EPUB media", () => {
  it("recognizes HLS streams without treating ordinary files as HLS", () => {
    expect(isHlsSource("https://example.com/course/video.m3u8")).toBe(true);
    expect(isHlsSource("https://example.com/course/video.m3u8?token=1")).toBe(true);
    expect(isHlsSource("https://example.com/course/video.mp4")).toBe(false);
  });

  it("prepares video and iframe controls while returning unsupported HLS targets", () => {
    const dom = new JSDOM(`<!doctype html><body>
      <figure data-dawn-media-card="video">
        <video data-dawn-stream="https://example.com/lesson.m3u8"></video>
        <iframe src="https://example.com/embed"></iframe>
        <a href="https://example.com/source">Source</a>
      </figure>
    </body>`);
    const testDocument = dom.window.document as unknown as Document;

    const result = prepareEpubMediaDocument(testDocument);
    const video = testDocument.querySelector("video")!;
    const frame = testDocument.querySelector("iframe")!;
    const link = testDocument.querySelector("a")!;

    expect(result.mediaCount).toBe(2);
    expect(result.hlsTargets).toEqual([{ element: video, source: "https://example.com/lesson.m3u8" }]);
    expect(video.controls).toBe(true);
    expect(video.preload).toBe("metadata");
    expect(video.playsInline).toBe(true);
    expect(frame.loading).toBe("lazy");
    expect(frame.getAttribute("allow")).toContain("picture-in-picture");
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
    expect(isEpubMediaControlTarget(video)).toBe(true);
    expect(isEpubMediaControlTarget(testDocument.body)).toBe(false);
  });
});
