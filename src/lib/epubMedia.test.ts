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
        <img src="chart.png" alt="Revenue chart" />
        <video autoplay="false" data-dawn-stream="https://example.com/lesson.m3u8"></video>
        <iframe src="https://www.youtube.com/embed/example" width="640" height="360"></iframe>
        <a href="https://example.com/source">Source</a>
      </figure>
    </body>`);
    const testDocument = dom.window.document as unknown as Document;

    const result = prepareEpubMediaDocument(testDocument);
    const video = testDocument.querySelector("video")!;
    const frame = testDocument.querySelector("iframe")!;
    const image = testDocument.querySelector("img")!;
    const link = testDocument.querySelector("a")!;

    expect(result.mediaCount).toBe(2);
    expect(result.hlsTargets).toEqual([{ element: video, source: "https://example.com/lesson.m3u8" }]);
    expect(video.controls).toBe(true);
    expect(video.preload).toBe("none");
    expect(video.hasAttribute("autoplay")).toBe(false);
    expect(video.playsInline).toBe(true);
    expect(frame.loading).toBe("lazy");
    expect(frame.getAttribute("allow")).toContain("picture-in-picture");
    expect(frame.getAttribute("sandbox")).toContain("allow-scripts");
    expect(frame.style.aspectRatio).toBe("640 / 360");
    expect(result.imageCount).toBe(1);
    expect(image.getAttribute("role")).toBeNull();
    expect(testDocument.querySelector("[data-dawn-image-action]")?.getAttribute("aria-label")).toBe("查看大图：Revenue chart");
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
    expect(isEpubMediaControlTarget(video)).toBe(true);
    expect(isEpubMediaControlTarget(testDocument.body)).toBe(false);
  });

  it("moves trusted video embeds to an explicit host-controlled launcher", () => {
    const dom = new JSDOM("<!doctype html><body><iframe src='https://www.youtube.com/embed/example' title='课程视频'></iframe></body>");
    const opened: string[] = [];
    const result = prepareEpubMediaDocument(dom.window.document as unknown as Document, {
      onEmbedActivate: (target) => opened.push(`${target.title}:${target.source}`),
    });
    const frame = dom.window.document.querySelector("iframe")!;
    const launcher = dom.window.document.querySelector<HTMLButtonElement>("[data-dawn-embed-action]")!;
    launcher.click();
    expect(frame.hidden).toBe(true);
    expect(frame.hasAttribute("src")).toBe(false);
    expect(result.embedTargets).toHaveLength(1);
    expect(opened).toEqual(["课程视频:https://www.youtube.com/embed/example"]);
  });

  it("opens meaningful images with keyboard and restricts unknown iframes", () => {
    const dom = new JSDOM(`<!doctype html><body>
      <h2>季度复盘</h2><figure><a href="https://example.com/original"><img src="chart.png" /><figcaption>估值区间</figcaption></a></figure>
      <iframe src="https://unknown.example/embed"></iframe>
    </body>`, { url: "https://book.example/chapter" });
    const testDocument = dom.window.document as unknown as Document;
    const opened: string[] = [];
    const result = prepareEpubMediaDocument(testDocument, {
      onImageActivate: (target) => opened.push(`${target.label}:${target.sourceHref}`),
    });
    const launcher = testDocument.querySelector<HTMLButtonElement>("[data-dawn-image-action]")!;
    launcher.click();

    expect(opened).toEqual(["估值区间:https://example.com/original"]);
    expect(testDocument.querySelector("iframe")?.getAttribute("sandbox")).toBe("");
    expect(testDocument.querySelector("iframe")?.getAttribute("data-dawn-embed-policy")).toBe("restricted");
    result.cleanup();
    launcher.click();
    expect(opened).toHaveLength(1);
  });

  it("uses the nearest section heading when an image has no alternative text or caption", () => {
    const dom = new JSDOM("<!doctype html><body><h2>一篇被禁的文章</h2><p>下面是截图。</p><figure><img src='page.png' /></figure></body>");
    const result = prepareEpubMediaDocument(dom.window.document as unknown as Document);
    expect(result.imageTargets[0]?.label).toBe("一篇被禁的文章 · 插图");
  });

  it("removes active-content URLs before an embed or link can navigate", () => {
    const dom = new JSDOM("<!doctype html><body><iframe src='javascript:alert(1)'></iframe><a href='javascript:alert(2)'>bad</a></body>");
    prepareEpubMediaDocument(dom.window.document as unknown as Document);
    expect(dom.window.document.querySelector("iframe")?.hasAttribute("src")).toBe(false);
    expect(dom.window.document.querySelector("iframe")?.dataset.dawnMediaState).toBe("unavailable");
    expect(dom.window.document.querySelector("a")?.hasAttribute("href")).toBe(false);
  });
});
