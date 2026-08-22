import { readerLocalStorage } from "./clientAccountContext";

export type ReadingPosition = {
  cfi: string | null;
  percentage: number;
  updatedAt?: string;
};

export function latestReadingPosition(
  local: ReadingPosition | null,
  cloud: ReadingPosition | null,
) {
  if (!cloud) return local;
  if (!local) return cloud;
  if (!cloud.updatedAt) return local;
  if (!local.updatedAt) return cloud;
  return cloud.updatedAt > local.updatedAt ? cloud : local;
}

export function positionAfterPagination(
  restored: ReadingPosition | null,
  currentCfi: string,
  percentage: number,
  navigatedWhilePaginating: boolean,
): ReadingPosition {
  return {
    cfi: currentCfi,
    percentage,
    ...(!navigatedWhilePaginating && restored?.updatedAt
      ? { updatedAt: restored.updatedAt }
      : {}),
  };
}

export function shouldPersistRelocatedPosition(
  interactionPending: boolean,
  reflowActive: boolean,
) {
  return interactionPending && !reflowActive;
}

export function parseReadingPosition(raw: string | null): ReadingPosition | null {
  if (!raw) return null;

  const legacyPercentage = Number(raw);
  if (Number.isFinite(legacyPercentage) && legacyPercentage >= 0 && legacyPercentage <= 100) {
    return { cfi: null, percentage: legacyPercentage };
  }

  try {
    const value = JSON.parse(raw) as Partial<ReadingPosition>;
    if (typeof value.percentage !== "number" || value.percentage < 0 || value.percentage > 100) return null;
    const position: ReadingPosition = {
      cfi: typeof value.cfi === "string" && value.cfi ? value.cfi : null,
      percentage: value.percentage,
    };
    if (typeof value.updatedAt === "string" && value.updatedAt) position.updatedAt = value.updatedAt;
    return position;
  } catch {
    return null;
  }
}

export function saveReadingPosition(key: string, position: ReadingPosition) {
  const next = { ...position, updatedAt: position.updatedAt ?? new Date().toISOString() };
  readerLocalStorage().setItem(key, JSON.stringify(next));
  return next;
}
