export type SelectionAssistPoint = { x: number; y: number };

export type SelectionAssistRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type SelectionAssistDirection = "forward" | "backward" | "unknown";

export type SelectionAssistAnchor = {
  rects: SelectionAssistRect[];
  focusRect: SelectionAssistRect;
  focusPoint: SelectionAssistPoint;
  focusIndex: number;
  direction: SelectionAssistDirection;
  strategy: "endpoint" | "direction" | "collapsed" | "bounding-fallback";
};

export type SelectionAssistVisibleBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type RectLike = Partial<SelectionAssistRect> & Pick<SelectionAssistRect, "left" | "top">;

type AnchorFromRectsOptions = {
  direction?: SelectionAssistDirection;
  endpoint?: SelectionAssistPoint | null;
  focusIndex?: number | null;
  offset?: SelectionAssistPoint;
  scale?: SelectionAssistPoint;
  visibleBounds?: SelectionAssistVisibleBounds | null;
  strategy?: SelectionAssistAnchor["strategy"];
};

type AnchorFromRangeOptions = Omit<AnchorFromRectsOptions, "focusIndex" | "strategy"> & {
  selection?: Selection | null;
};

const MIN_RECT_SIZE = 0.5;
const RECT_EPSILON = 0.25;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizedRect(
  value: RectLike,
  offset: SelectionAssistPoint,
  scale: SelectionAssistPoint,
): SelectionAssistRect | null {
  const rawRight = finite(value.right)
    ? value.right
    : finite(value.width) ? value.left + value.width : NaN;
  const rawBottom = finite(value.bottom)
    ? value.bottom
    : finite(value.height) ? value.top + value.height : NaN;
  if (![value.left, value.top, rawRight, rawBottom].every(finite)) return null;
  const scaledLeft = value.left * scale.x + offset.x;
  const scaledRight = rawRight * scale.x + offset.x;
  const scaledTop = value.top * scale.y + offset.y;
  const scaledBottom = rawBottom * scale.y + offset.y;
  const left = Math.min(scaledLeft, scaledRight);
  const right = Math.max(scaledLeft, scaledRight);
  const top = Math.min(scaledTop, scaledBottom);
  const bottom = Math.max(scaledTop, scaledBottom);
  const width = right - left;
  const height = bottom - top;
  if (width < MIN_RECT_SIZE || height < MIN_RECT_SIZE) return null;
  return { left, top, right, bottom, width, height };
}

function intersects(rect: SelectionAssistRect, bounds: SelectionAssistVisibleBounds) {
  return rect.right > bounds.left + MIN_RECT_SIZE
    && rect.left < bounds.right - MIN_RECT_SIZE
    && rect.bottom > bounds.top + MIN_RECT_SIZE
    && rect.top < bounds.bottom - MIN_RECT_SIZE;
}

function almostSameRect(left: SelectionAssistRect, right: SelectionAssistRect) {
  return Math.abs(left.left - right.left) <= RECT_EPSILON
    && Math.abs(left.top - right.top) <= RECT_EPSILON
    && Math.abs(left.right - right.right) <= RECT_EPSILON
    && Math.abs(left.bottom - right.bottom) <= RECT_EPSILON;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

export function normalizedSelectionAssistRects(
  rects: Iterable<RectLike>,
  options: Pick<AnchorFromRectsOptions, "offset" | "scale" | "visibleBounds"> = {},
) {
  const offset = options.offset ?? { x: 0, y: 0 };
  const requestedScale = options.scale ?? { x: 1, y: 1 };
  const scale = {
    x: finite(requestedScale.x) && requestedScale.x !== 0 ? requestedScale.x : 1,
    y: finite(requestedScale.y) && requestedScale.y !== 0 ? requestedScale.y : 1,
  };
  const candidates: SelectionAssistRect[] = [];
  for (const value of rects) {
    const rect = normalizedRect(value, offset, scale);
    if (!rect || (options.visibleBounds && !intersects(rect, options.visibleBounds))) continue;
    if (!candidates.some((candidate) => almostSameRect(candidate, rect))) candidates.push(rect);
  }
  if (candidates.length < 2) return candidates;

  // DOM Range client rects are line fragments. A single very tall rectangle in
  // an otherwise line-sized set is generally stale layout noise or a union-like
  // box leaked by a consumer; exclude it without rejecting legitimate long lines.
  const medianHeight = median(candidates.map((rect) => rect.height));
  const filtered = candidates.filter((rect) => !(
    rect.height > Math.max(96, medianHeight * 6)
    && rect.width > Math.max(160, medianHeight * 10)
  ));
  return filtered.length ? filtered : candidates;
}

function squaredDistanceToRect(point: SelectionAssistPoint, rect: SelectionAssistRect) {
  const dx = point.x < rect.left ? rect.left - point.x : point.x > rect.right ? point.x - rect.right : 0;
  const dy = point.y < rect.top ? rect.top - point.y : point.y > rect.bottom ? point.y - rect.bottom : 0;
  return dx * dx + dy * dy;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function directionalIndex(direction: SelectionAssistDirection, length: number) {
  return direction === "backward" ? 0 : Math.max(0, length - 1);
}

export function selectionAssistAnchorFromRects(
  rects: Iterable<RectLike>,
  options: AnchorFromRectsOptions = {},
): SelectionAssistAnchor | null {
  const direction = options.direction ?? "unknown";
  const normalized = normalizedSelectionAssistRects(rects, options);
  if (!normalized.length) return null;

  let focusIndex = typeof options.focusIndex === "number"
    ? clamp(Math.round(options.focusIndex), 0, normalized.length - 1)
    : directionalIndex(direction, normalized.length);
  let strategy = options.strategy ?? "direction";

  if (options.endpoint && finite(options.endpoint.x) && finite(options.endpoint.y)) {
    let bestDistance = Number.POSITIVE_INFINITY;
    const tieBreaker = directionalIndex(direction, normalized.length);
    normalized.forEach((rect, index) => {
      const distance = squaredDistanceToRect(options.endpoint!, rect);
      if (distance < bestDistance - RECT_EPSILON) {
        bestDistance = distance;
        focusIndex = index;
      } else if (Math.abs(distance - bestDistance) <= RECT_EPSILON) {
        const currentDistance = Math.abs(focusIndex - tieBreaker);
        const candidateDistance = Math.abs(index - tieBreaker);
        if (candidateDistance < currentDistance) focusIndex = index;
      }
    });
    strategy = "endpoint";
  }

  const focusRect = normalized[focusIndex];
  const fallbackPoint = {
    x: focusRect.left + focusRect.width / 2,
    y: focusRect.top + focusRect.height / 2,
  };
  const focusPoint = options.endpoint ? {
    x: clamp(options.endpoint.x, focusRect.left, focusRect.right),
    y: clamp(options.endpoint.y, focusRect.top, focusRect.bottom),
  } : fallbackPoint;

  return { rects: normalized, focusRect, focusPoint, focusIndex, direction, strategy };
}

export function selectionAssistDirection(selection: Selection | null | undefined): SelectionAssistDirection {
  if (!selection) return "unknown";
  const browserDirection = (selection as Selection & { direction?: string }).direction;
  if (browserDirection === "forward" || browserDirection === "backward") return browserDirection;
  const { anchorNode, focusNode, anchorOffset, focusOffset } = selection;
  if (!anchorNode || !focusNode) return "unknown";
  if (anchorNode === focusNode) {
    if (anchorOffset === focusOffset) return "unknown";
    return anchorOffset < focusOffset ? "forward" : "backward";
  }
  const document = anchorNode.ownerDocument ?? focusNode.ownerDocument;
  if (!document) return "unknown";
  try {
    const anchor = document.createRange();
    anchor.setStart(anchorNode, anchorOffset);
    anchor.collapse(true);
    const focus = document.createRange();
    focus.setStart(focusNode, focusOffset);
    focus.collapse(true);
    return anchor.compareBoundaryPoints(anchor.START_TO_START, focus) <= 0 ? "forward" : "backward";
  } catch {
    return "unknown";
  }
}

function collapsedFocusRect(range: Range, direction: SelectionAssistDirection) {
  try {
    const collapsed = range.cloneRange();
    collapsed.collapse(direction === "backward");
    const rects = Array.from(collapsed.getClientRects());
    const rect = direction === "backward" ? rects[0] : rects.at(-1);
    return rect ?? collapsed.getBoundingClientRect();
  } catch {
    return null;
  }
}

function fallbackIsUnionLike(rect: RectLike, visibleBounds?: SelectionAssistVisibleBounds | null) {
  if (!visibleBounds || !finite(rect.right) || !finite(rect.bottom)) return false;
  const width = Math.abs(rect.right - rect.left);
  const height = Math.abs(rect.bottom - rect.top);
  const availableWidth = visibleBounds.right - visibleBounds.left;
  const availableHeight = visibleBounds.bottom - visibleBounds.top;
  return width >= availableWidth * 0.9 && height >= availableHeight * 0.45;
}

export function selectionAssistAnchorFromRange(
  range: Range,
  options: AnchorFromRangeOptions = {},
): SelectionAssistAnchor | null {
  const commonNode = range.commonAncestorContainer;
  if ("isConnected" in commonNode && !commonNode.isConnected) return null;
  const direction = options.direction ?? selectionAssistDirection(options.selection);
  let clientRects: DOMRect[] = [];
  try { clientRects = Array.from(range.getClientRects()); } catch { /* collapsed fallback below */ }
  const fromClientRects = selectionAssistAnchorFromRects(clientRects, {
    ...options,
    direction,
    strategy: options.endpoint ? "endpoint" : "direction",
  });
  if (fromClientRects) return fromClientRects;

  const collapsed = collapsedFocusRect(range, direction);
  if (collapsed && !fallbackIsUnionLike(collapsed, options.visibleBounds)) {
    const anchor = selectionAssistAnchorFromRects([collapsed], {
      ...options,
      direction,
      strategy: "collapsed",
    });
    if (anchor) return anchor;
  }

  try {
    const bounding = range.getBoundingClientRect();
    if (fallbackIsUnionLike(bounding, options.visibleBounds)) return null;
    return selectionAssistAnchorFromRects([bounding], {
      ...options,
      direction,
      strategy: "bounding-fallback",
    });
  } catch {
    return null;
  }
}

export function selectionAssistRectFromDomRect(rect: Pick<DOMRect, "left" | "top" | "right" | "bottom">) {
  return normalizedRect(rect as RectLike, { x: 0, y: 0 }, { x: 1, y: 1 });
}
