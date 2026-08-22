import { readerLocalStorage } from "./clientAccountContext";
import type { ReaderTheme } from "./readerSettings";

export type PdfAppearanceTone = "original" | "warm" | "night";
export const LEGACY_PDF_APPEARANCE_EXPERIMENT_KEY = "dawn-pdf-appearance-experiment-v1";

export function pdfAppearanceTone(theme: ReaderTheme): PdfAppearanceTone {
  return theme === "paper" ? "original" : theme === "sepia" ? "warm" : "night";
}

export function pdfAppearancePageFilter(theme: ReaderTheme): string {
  if (theme === "paper") return "none";
  return theme === "sepia"
    ? "brightness(0.90) sepia(0.06)"
    : "brightness(0.72)";
}

export function loadLegacyPdfAppearanceTheme(storage: Storage = readerLocalStorage()): ReaderTheme | null {
  try {
    const value = JSON.parse(storage.getItem(LEGACY_PDF_APPEARANCE_EXPERIMENT_KEY) ?? "null") as { tone?: unknown } | null;
    if (value?.tone === "warm") return "sepia";
    if (value?.tone === "night") return "night";
    if (value?.tone === "original") return "paper";
  } catch {
    // Ignore the disposable comparison state and use the shared reading theme.
  }
  return null;
}
