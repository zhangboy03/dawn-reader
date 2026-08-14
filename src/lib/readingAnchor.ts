export type AnchorRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type AnchorPoint = { x: number; y: number };

/**
 * Prefer the reader's visual center, then probe either reading column when the
 * center lands in a spread gutter or other blank space.
 */
export function visualAnchorPoints(rect: AnchorRect): AnchorPoint[] {
  const xRatios = [0.5, 0.28, 0.72, 0.16, 0.84];
  const yRatios = [0.46, 0.3, 0.62];
  return yRatios.flatMap((yRatio) => xRatios.map((xRatio) => ({
    x: rect.left + rect.width * xRatio,
    y: rect.top + rect.height * yRatio,
  })));
}

export function restoredScrollTop(
  currentScrollTop: number,
  previousViewportTop: number,
  nextViewportTop: number,
  maxScrollTop: number,
) {
  const desired = currentScrollTop + nextViewportTop - previousViewportTop;
  return Math.min(Math.max(0, desired), Math.max(0, maxScrollTop));
}
