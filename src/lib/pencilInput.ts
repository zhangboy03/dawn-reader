import type { PencilMode } from "./readerSettings";

export function nextPencilMode(mode: PencilMode): PencilMode {
  return mode === "page" ? "select" : "page";
}

export function pageTurnFromPointer(startX: number, endX: number, width: number) {
  const distance = endX - startX;
  if (Math.abs(distance) >= 44) return distance > 0 ? "prev" : "next";
  return endX < width / 2 ? "prev" : "next";
}
