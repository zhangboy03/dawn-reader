export type SelectionBounds = {
  x: number;
  top: number;
  bottom: number;
};

export type SelectionAssistPosition = {
  left: number;
  top: number;
  maxHeight: number;
  placement: "above" | "below";
};

type PositionInput = {
  anchor: SelectionBounds;
  popover: { width: number; height: number };
  viewport: { width: number; height: number };
  safeArea: { top: number; bottom: number };
  gap?: number;
  sideMargin?: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  if (maximum < minimum) return (minimum + maximum) / 2;
  return Math.min(Math.max(value, minimum), maximum);
}

export function selectionAssistPosition({
  anchor,
  popover,
  viewport,
  safeArea,
  gap = 12,
  sideMargin = 16,
}: PositionInput): SelectionAssistPosition {
  const safeTop = clamp(safeArea.top, 0, viewport.height);
  const safeBottom = clamp(safeArea.bottom, safeTop, viewport.height);
  const availableAbove = Math.max(0, anchor.top - gap - safeTop);
  const availableBelow = Math.max(0, safeBottom - anchor.bottom - gap);
  const placement = popover.height <= availableAbove || availableAbove >= availableBelow
    ? "above"
    : "below";
  const availableHeight = placement === "above" ? availableAbove : availableBelow;
  const usableWidth = Math.min(popover.width, Math.max(0, viewport.width - sideMargin * 2));
  const halfWidth = usableWidth / 2;

  return {
    left: clamp(anchor.x, sideMargin + halfWidth, viewport.width - sideMargin - halfWidth),
    top: placement === "above" ? anchor.top - gap : anchor.bottom + gap,
    maxHeight: Math.floor(availableHeight),
    placement,
  };
}
