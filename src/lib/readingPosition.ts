export type ReadingPosition = {
  cfi: string | null;
  percentage: number;
};

export function parseReadingPosition(raw: string | null): ReadingPosition | null {
  if (!raw) return null;

  const legacyPercentage = Number(raw);
  if (Number.isFinite(legacyPercentage) && legacyPercentage >= 0 && legacyPercentage <= 100) {
    return { cfi: null, percentage: legacyPercentage };
  }

  try {
    const value = JSON.parse(raw) as Partial<ReadingPosition>;
    if (typeof value.percentage !== "number" || value.percentage < 0 || value.percentage > 100) return null;
    return {
      cfi: typeof value.cfi === "string" && value.cfi ? value.cfi : null,
      percentage: value.percentage,
    };
  } catch {
    return null;
  }
}

export function saveReadingPosition(key: string, position: ReadingPosition) {
  localStorage.setItem(key, JSON.stringify(position));
}
