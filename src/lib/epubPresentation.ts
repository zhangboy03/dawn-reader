export const EPUB_TARGET_RESOURCE_LEASE_MS = 5_000;

type VisualRect = Pick<DOMRectReadOnly, "top" | "right" | "bottom" | "left" | "width" | "height">;

function measurable(rect: VisualRect) {
  return [rect.top, rect.right, rect.bottom, rect.left, rect.width, rect.height].every(Number.isFinite)
    && rect.width > 0
    && rect.height > 0;
}

function intersectsHost(rect: VisualRect, iframeRect: Pick<DOMRectReadOnly, "top" | "left">, hostRect: VisualRect) {
  if (!measurable(rect)) return false;
  const top = iframeRect.top + rect.top;
  const right = iframeRect.left + rect.right;
  const bottom = iframeRect.top + rect.bottom;
  const left = iframeRect.left + rect.left;
  return bottom >= hostRect.top && top <= hostRect.bottom && right >= hostRect.left && left <= hostRect.right;
}

function visibleRects(element: Element) {
  const direct = Array.from(element.getClientRects()).filter(measurable);
  if (direct.length) return direct;
  const bounding = element.getBoundingClientRect();
  return measurable(bounding) ? [bounding] : [];
}

function elementIsRendered(element: Element) {
  const style = element.ownerDocument.defaultView?.getComputedStyle?.(element);
  return style?.display !== "none" && style?.visibility !== "hidden" && style?.visibility !== "collapse" && style?.opacity !== "0";
}

function mediaIsReady(element: Element) {
  if (element.tagName === "IMG") {
    const image = element as HTMLImageElement;
    return image.complete && image.naturalWidth > 0 && !image.dataset.dawnMediaState?.includes("unavailable");
  }
  if (element.tagName === "CANVAS") {
    const canvas = element as HTMLCanvasElement;
    return canvas.width > 0 && canvas.height > 0;
  }
  if (element.tagName === "VIDEO") {
    const video = element as HTMLVideoElement;
    return Boolean(video.poster) || video.readyState >= 1;
  }
  return true;
}

function hasRenderedText(document: Document, iframeRect: Pick<DOMRectReadOnly, "top" | "left">, hostRect: VisualRect) {
  const root = document.body ?? document.documentElement;
  if (!root) return false;
  const showText = document.defaultView?.NodeFilter.SHOW_TEXT ?? 4;
  const walker = document.createTreeWalker(root, showText);
  let node = walker.nextNode();
  while (node) {
    if (node.textContent?.trim()) {
      const range = document.createRange();
      range.selectNodeContents(node);
      if (Array.from(range.getClientRects()).some((rect) => intersectsHost(rect, iframeRect, hostRect))) return true;
    }
    node = walker.nextNode();
  }
  return false;
}

/**
 * Tests the staged publication itself, independently from the precision of any
 * CFI used to reach it. Text, images, SVG graphics, canvas/video and authored
 * CSS backgrounds are all valid visual publication content.
 */
export function epubDocumentIsPresentable(
  document: Document,
  iframeRect: Pick<DOMRectReadOnly, "top" | "left">,
  hostRect: VisualRect,
) {
  if (hasRenderedText(document, iframeRect, hostRect)) return true;
  const candidates = Array.from(document.querySelectorAll("img, svg, canvas, video, object, embed, iframe, body *"));
  for (const element of candidates) {
    if (!elementIsRendered(element) || !mediaIsReady(element)) continue;
    const style = document.defaultView?.getComputedStyle?.(element);
    const intrinsicallyVisual = element.matches("img, svg, canvas, video, object, embed, iframe")
      || Boolean(style?.backgroundImage && style.backgroundImage !== "none");
    if (!intrinsicallyVisual) continue;
    if (visibleRects(element).some((rect) => intersectsHost(rect, iframeRect, hostRect))) return true;
  }
  return false;
}

export async function settleEpubResourcesWithinLease(
  tasks: Promise<unknown>[],
  signal: AbortSignal,
  leaseMs = EPUB_TARGET_RESOURCE_LEASE_MS,
) {
  if (!tasks.length) return "settled" as const;
  if (signal.aborted) return "aborted" as const;
  return new Promise<"settled" | "expired" | "aborted">((resolve) => {
    let finished = false;
    const finish = (result: "settled" | "expired" | "aborted") => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const onAbort = () => finish("aborted");
    const timer = setTimeout(() => finish("expired"), leaseMs);
    signal.addEventListener("abort", onAbort, { once: true });
    void Promise.allSettled(tasks).then(() => finish("settled"));
  });
}
