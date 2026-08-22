// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { epubDocumentIsPresentable, settleEpubResourcesWithinLease } from "./epubPresentation";

const visibleRect = { top: 0, left: 0, right: 200, bottom: 300, width: 200, height: 300 } as DOMRect;

describe("EPUB target resource lease", () => {
  it("settles finite target work", async () => {
    const controller = new AbortController();
    await expect(settleEpubResourcesWithinLease([Promise.resolve()], controller.signal, 50)).resolves.toBe("settled");
  });

  it("expires never-settling work under a controlled clock", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const result = settleEpubResourcesWithinLease([new Promise(() => undefined)], controller.signal, 50);
    await vi.advanceTimersByTimeAsync(50);
    await expect(result).resolves.toBe("expired");
    vi.useRealTimers();
  });

  it("ends a superseded renderer lease on abort", async () => {
    const controller = new AbortController();
    const result = settleEpubResourcesWithinLease([new Promise(() => undefined)], controller.signal, 50_000);
    controller.abort();
    await expect(result).resolves.toBe("aborted");
  });
});

describe("EPUB visual presentation", () => {
  it("accepts an image/SVG publication page without requiring adjacent text", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.innerHTML = '<image href="cover.jpeg" width="200" height="300" />';
    Object.defineProperty(svg, "getClientRects", { value: () => [visibleRect] });
    document.body.replaceChildren(svg);
    expect(epubDocumentIsPresentable(document, { top: 0, left: 0 }, visibleRect)).toBe(true);
  });

  it("does not call a broken sole image a successful visual page", () => {
    const image = document.createElement("img");
    Object.defineProperty(image, "complete", { value: true });
    Object.defineProperty(image, "naturalWidth", { value: 0 });
    Object.defineProperty(image, "getClientRects", { value: () => [visibleRect] });
    document.body.replaceChildren(image);
    expect(epubDocumentIsPresentable(document, { top: 0, left: 0 }, visibleRect)).toBe(false);
  });
});
