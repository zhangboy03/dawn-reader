import { pdfQuadToViewportRect, type PdfQuad, type PdfViewportLike } from "./pdfHighlights";
import {
  selectionAssistAnchorFromRects,
  type SelectionAssistAnchor,
  type SelectionAssistDirection,
  type SelectionAssistVisibleBounds,
} from "./selectionAssistAnchor";

export type PdfSelectionAssistPageRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type PdfSelectionAssistViewport = Pick<PdfViewportLike, "convertToViewportPoint"> & {
  width: number;
  height: number;
};

type PdfSelectionAssistAnchorInput = {
  quads: PdfQuad[];
  viewport: PdfSelectionAssistViewport;
  pageRect: PdfSelectionAssistPageRect;
  focusIndex: number;
  direction: SelectionAssistDirection;
  visibleBounds?: SelectionAssistVisibleBounds | null;
};

/**
 * Reprojects durable PDF-space quads into current visual-viewport coordinates.
 * Page scrolling changes pageRect; zoom/rotation changes viewport. The logical
 * focus fragment is retained when visible and falls to the nearest visible
 * fragment when the original endpoint has moved outside the safe viewport.
 */
export function selectionAssistAnchorFromPdfQuads({
  quads,
  viewport,
  pageRect,
  focusIndex,
  direction,
  visibleBounds,
}: PdfSelectionAssistAnchorInput): SelectionAssistAnchor | null {
  if (
    !Number.isFinite(pageRect.left)
    || !Number.isFinite(pageRect.top)
    || !Number.isFinite(pageRect.width)
    || !Number.isFinite(pageRect.height)
    || pageRect.width <= 0
    || pageRect.height <= 0
    || !Number.isFinite(viewport.width)
    || !Number.isFinite(viewport.height)
    || viewport.width <= 0
    || viewport.height <= 0
  ) return null;

  const scaleX = pageRect.width / viewport.width;
  const scaleY = pageRect.height / viewport.height;
  const rects = quads.flatMap((quad) => {
    const local = pdfQuadToViewportRect(quad, viewport);
    if (!local) return [];
    return [{
      left: pageRect.left + local.left * scaleX,
      top: pageRect.top + local.top * scaleY,
      right: pageRect.left + (local.left + local.width) * scaleX,
      bottom: pageRect.top + (local.top + local.height) * scaleY,
    }];
  });
  if (!rects.length) return null;

  const logicalFocus = rects[Math.min(Math.max(Math.round(focusIndex), 0), rects.length - 1)];
  const endpoint = logicalFocus ? {
    x: (logicalFocus.left + logicalFocus.right) / 2,
    y: (logicalFocus.top + logicalFocus.bottom) / 2,
  } : null;
  return selectionAssistAnchorFromRects(rects, { direction, endpoint, visibleBounds });
}
