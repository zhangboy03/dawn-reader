import type { SelectionAssistAnchor, SelectionAssistVisibleBounds } from "./selectionAssistAnchor";

export type SelectionAssistPlacement = "above" | "below" | "panel" | "sheet";

export type SelectionAssistPosition = {
  left: number;
  top: number;
  width: number;
  height: number;
  maxHeight: number;
  placement: SelectionAssistPlacement;
  strategy: "adjacent" | "edge-panel" | "compact-sheet";
};

export type SelectionAssistViewport = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type PositionInput = {
  anchor: Pick<SelectionAssistAnchor, "focusRect" | "focusPoint">;
  popover: { width: number; naturalHeight: number };
  viewport: SelectionAssistViewport;
  safeArea?: SelectionAssistVisibleBounds | null;
  compact?: boolean;
  gap?: number;
  sideMargin?: number;
  edgeMargin?: number;
  minimumUsefulHeight?: number;
  maximumHeight?: number;
  preferredSide?: "above" | "below" | "auto";
};

function clamp(value: number, minimum: number, maximum: number) {
  if (maximum < minimum) return minimum;
  return Math.min(Math.max(value, minimum), maximum);
}

function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

export function visualViewportRect(
  viewport: Pick<VisualViewport, "offsetLeft" | "offsetTop" | "width" | "height"> | null | undefined,
  fallback: { width: number; height: number },
): SelectionAssistViewport {
  return {
    left: finite(viewport?.offsetLeft ?? 0, 0),
    top: finite(viewport?.offsetTop ?? 0, 0),
    width: Math.max(0, finite(viewport?.width ?? fallback.width, fallback.width)),
    height: Math.max(0, finite(viewport?.height ?? fallback.height, fallback.height)),
  };
}

export function intersectSelectionAssistBounds(
  viewport: SelectionAssistViewport,
  safeArea?: SelectionAssistVisibleBounds | null,
  edgeMargin = 12,
): SelectionAssistVisibleBounds {
  const viewportRight = viewport.left + viewport.width;
  const viewportBottom = viewport.top + viewport.height;
  const requested = safeArea ?? {
    left: viewport.left,
    top: viewport.top,
    right: viewportRight,
    bottom: viewportBottom,
  };
  const left = clamp(Math.max(viewport.left + edgeMargin, requested.left + edgeMargin), viewport.left, viewportRight);
  const top = clamp(Math.max(viewport.top + edgeMargin, requested.top + edgeMargin), viewport.top, viewportBottom);
  const right = clamp(Math.min(viewportRight - edgeMargin, requested.right - edgeMargin), left, viewportRight);
  const bottom = clamp(Math.min(viewportBottom - edgeMargin, requested.bottom - edgeMargin), top, viewportBottom);
  return { left, top, right, bottom };
}

function preferredPlacement(
  input: PositionInput,
  safe: SelectionAssistVisibleBounds,
): "above" | "below" {
  if (input.preferredSide && input.preferredSide !== "auto") return input.preferredSide;
  const midpoint = safe.top + (safe.bottom - safe.top) / 2;
  return input.anchor.focusPoint.y >= midpoint ? "above" : "below";
}

function rounded(position: SelectionAssistPosition): SelectionAssistPosition {
  return {
    ...position,
    left: Math.round(position.left * 100) / 100,
    top: Math.round(position.top * 100) / 100,
    width: Math.round(position.width * 100) / 100,
    height: Math.round(position.height * 100) / 100,
    maxHeight: Math.floor(position.maxHeight),
  };
}

export function selectionAssistPosition({
  anchor,
  popover,
  viewport,
  safeArea,
  compact = false,
  gap = 12,
  sideMargin = 16,
  edgeMargin = 12,
  minimumUsefulHeight = 176,
  maximumHeight = 560,
  preferredSide = "auto",
}: PositionInput): SelectionAssistPosition {
  const safe = intersectSelectionAssistBounds(viewport, safeArea, edgeMargin);
  const safeWidth = Math.max(0, safe.right - safe.left);
  const safeHeight = Math.max(0, safe.bottom - safe.top);
  const width = Math.min(Math.max(0, popover.width), Math.max(0, safeWidth - sideMargin * 2));
  const maxAllowedHeight = Math.max(0, Math.min(maximumHeight, safeHeight));
  const naturalHeight = Math.max(1, finite(popover.naturalHeight, minimumUsefulHeight));
  const renderedHeight = Math.min(naturalHeight, maxAllowedHeight);
  const left = clamp(anchor.focusPoint.x - width / 2, safe.left + sideMargin, safe.right - sideMargin - width);

  if (compact) {
    return rounded({
      left,
      top: Math.max(safe.top, safe.bottom - renderedHeight),
      width,
      height: renderedHeight,
      maxHeight: maxAllowedHeight,
      placement: "sheet",
      strategy: "compact-sheet",
    });
  }

  const availableAbove = Math.max(0, anchor.focusRect.top - gap - safe.top);
  const availableBelow = Math.max(0, safe.bottom - anchor.focusRect.bottom - gap);
  const requiredHeight = Math.min(naturalHeight, minimumUsefulHeight);
  const preferred = preferredPlacement({
    anchor,
    popover,
    viewport,
    safeArea,
    compact,
    gap,
    sideMargin,
    edgeMargin,
    minimumUsefulHeight,
    maximumHeight,
    preferredSide,
  }, safe);
  const alternate = preferred === "above" ? "below" : "above";
  const available = { above: availableAbove, below: availableBelow };
  const side = available[preferred] >= requiredHeight
    ? preferred
    : available[alternate] >= requiredHeight
      ? alternate
      : null;

  if (side) {
    const maxHeight = Math.min(maximumHeight, available[side]);
    const height = Math.min(naturalHeight, maxHeight);
    return rounded({
      left,
      top: side === "above" ? anchor.focusRect.top - gap - height : anchor.focusRect.bottom + gap,
      width,
      height,
      maxHeight,
      placement: side,
      strategy: "adjacent",
    });
  }

  // Neither adjacent side can preserve a useful first result. Use an explicit
  // edge-safe panel instead of feeding a tiny max-height back into measurement.
  const fartherEdge = anchor.focusPoint.y >= safe.top + safeHeight / 2 ? "top" : "bottom";
  const panelTop = fartherEdge === "top" ? safe.top : safe.bottom - renderedHeight;
  return rounded({
    left,
    top: clamp(panelTop, safe.top, safe.bottom - renderedHeight),
    width,
    height: renderedHeight,
    maxHeight: maxAllowedHeight,
    placement: "panel",
    strategy: "edge-panel",
  });
}

export function selectionAssistPositionEqual(
  left: SelectionAssistPosition | null,
  right: SelectionAssistPosition | null,
  tolerance = 0.25,
) {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.placement === right.placement
    && left.strategy === right.strategy
    && Math.abs(left.left - right.left) <= tolerance
    && Math.abs(left.top - right.top) <= tolerance
    && Math.abs(left.width - right.width) <= tolerance
    && Math.abs(left.height - right.height) <= tolerance
    && Math.abs(left.maxHeight - right.maxHeight) <= tolerance;
}
