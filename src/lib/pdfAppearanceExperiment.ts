import { readerLocalStorage } from "./clientAccountContext";

export type PdfAppearanceTone = "original" | "warm" | "night";
export type PdfAppearanceTreatment = "surroundings" | "page";

export type PdfAppearanceExperiment = {
  tone: PdfAppearanceTone;
  treatment: PdfAppearanceTreatment;
};

export const PDF_APPEARANCE_EXPERIMENT_KEY = "dawn-pdf-appearance-experiment-v1";
export const DEFAULT_PDF_APPEARANCE_EXPERIMENT: PdfAppearanceExperiment = {
  tone: "original",
  treatment: "surroundings",
};

export function pdfAppearancePageFilter(appearance: PdfAppearanceExperiment): string {
  if (appearance.treatment !== "page" || appearance.tone === "original") return "none";
  return appearance.tone === "warm"
    ? "brightness(0.90) sepia(0.06)"
    : "brightness(0.72)";
}

export function normalizePdfAppearanceExperiment(value: unknown): PdfAppearanceExperiment {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    tone: raw.tone === "warm" || raw.tone === "night" ? raw.tone : "original",
    treatment: raw.treatment === "page" ? "page" : "surroundings",
  };
}

export function loadPdfAppearanceExperiment(storage: Storage = readerLocalStorage()): PdfAppearanceExperiment {
  try {
    return normalizePdfAppearanceExperiment(JSON.parse(storage.getItem(PDF_APPEARANCE_EXPERIMENT_KEY) ?? "{}"));
  } catch {
    return DEFAULT_PDF_APPEARANCE_EXPERIMENT;
  }
}

export function savePdfAppearanceExperiment(
  appearance: PdfAppearanceExperiment | unknown,
  storage: Storage = readerLocalStorage(),
) {
  const normalized = normalizePdfAppearanceExperiment(appearance);
  storage.setItem(PDF_APPEARANCE_EXPERIMENT_KEY, JSON.stringify(normalized));
  return normalized;
}
