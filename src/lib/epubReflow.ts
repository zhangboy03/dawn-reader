export type EpubFrameSize = { width: number; height: number };

export type EpubReflowRequest = {
  anchor: string | null;
  appearance: boolean;
  appearanceRevision: number;
  revision: number;
};

export type EpubReflowAction = "resize" | "redisplay" | "none";

/**
 * Coalesce a burst of layout and appearance changes without losing the CFI
 * captured before the first change in that burst.
 */
export function mergeEpubReflowRequest(
  current: EpubReflowRequest | null,
  next: EpubReflowRequest,
): EpubReflowRequest {
  if (!current) return next;
  return {
    anchor: current.anchor ?? next.anchor,
    appearance: current.appearance || next.appearance,
    appearanceRevision: Math.max(current.appearanceRevision, next.appearanceRevision),
    revision: Math.max(current.revision, next.revision),
  };
}

export function epubFrameSize(rect: { width: number; height: number }): EpubFrameSize | null {
  const width = Math.floor(rect.width);
  const height = Math.floor(rect.height);
  return width > 0 && height > 0 ? { width, height } : null;
}

export function epubFrameChanged(
  previous: EpubFrameSize | null,
  next: EpubFrameSize,
  tolerance = 1,
) {
  return !previous
    || Math.abs(previous.width - next.width) > tolerance
    || Math.abs(previous.height - next.height) > tolerance;
}

/**
 * EPUB.js already clears and redisplays after a real resize. Appearance-only
 * changes need one explicit redisplay because the manager ignores same-size
 * resize calls.
 */
export function epubReflowAction(
  request: EpubReflowRequest,
  previous: EpubFrameSize | null,
  next: EpubFrameSize,
): EpubReflowAction {
  if (epubFrameChanged(previous, next)) return "resize";
  if (request.appearance) return "redisplay";
  return "none";
}
