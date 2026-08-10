import type { PencilMode } from "./readerSettings";

export type ReaderInputKind = "mouse" | "touch" | "pen";

export function nextPencilMode(mode: PencilMode): PencilMode {
  return mode === "page" ? "select" : "page";
}

export function pointerInputKind(pointerType: string): ReaderInputKind {
  if (pointerType === "pen") return "pen";
  if (pointerType === "touch") return "touch";
  return "mouse";
}

export function touchInputKind(touchType?: string): ReaderInputKind {
  return touchType === "stylus" ? "pen" : "touch";
}

export function shouldTurnPage(kind: ReaderInputKind, mode: PencilMode) {
  return kind === "touch" || (kind === "pen" && mode === "page");
}

export function shouldCaptureSelection(kind: ReaderInputKind, mode: PencilMode) {
  return kind === "mouse" || (kind === "pen" && mode === "select");
}

export function pageTurnFromPointer(startX: number, startY: number, endX: number, endY: number, width: number) {
  const distance = endX - startX;
  const verticalDistance = endY - startY;
  if (Math.abs(verticalDistance) > Math.abs(distance) && Math.abs(verticalDistance) > 18) return null;
  if (Math.abs(distance) >= 44) return distance > 0 ? "prev" : "next";
  if (Math.hypot(distance, verticalDistance) > 18) return null;
  const pageX = ((endX % width) + width) % width;
  return pageX < width / 2 ? "prev" : "next";
}
