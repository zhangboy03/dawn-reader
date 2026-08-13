import type { PencilMode } from "./readerSettings";

export type ReaderInputKind = "mouse" | "touch" | "pen";

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

export function pageTurnFromPointer(startX: number, startY: number, endX: number, endY: number, width: number) {
  const distance = endX - startX;
  const verticalDistance = endY - startY;
  if (Math.abs(verticalDistance) > Math.abs(distance) && Math.abs(verticalDistance) > 18) return null;
  if (Math.abs(distance) >= 44) return distance > 0 ? "prev" : "next";
  if (Math.hypot(distance, verticalDistance) > 18) return null;
  const pageX = ((endX % width) + width) % width;
  return pageX < width / 2 ? "prev" : "next";
}

export function pageTurnFromKey(key: string) {
  if (key === "ArrowLeft") return "prev" as const;
  if (key === "ArrowRight") return "next" as const;
  return null;
}
