import { describe, expect, it } from "vitest";
import {
  DEFAULT_PDF_APPEARANCE_EXPERIMENT,
  PDF_APPEARANCE_EXPERIMENT_KEY,
  loadPdfAppearanceExperiment,
  normalizePdfAppearanceExperiment,
  pdfAppearancePageFilter,
  savePdfAppearanceExperiment,
} from "./pdfAppearanceExperiment";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe("PDF appearance experiment", () => {
  it("falls back to exact original surroundings for invalid state", () => {
    expect(normalizePdfAppearanceExperiment(null)).toEqual(DEFAULT_PDF_APPEARANCE_EXPERIMENT);
    expect(normalizePdfAppearanceExperiment({ tone: "sepia", treatment: "filter" })).toEqual(
      DEFAULT_PDF_APPEARANCE_EXPERIMENT,
    );
  });

  it("preserves the two comparison treatments and three tones", () => {
    expect(normalizePdfAppearanceExperiment({ tone: "warm", treatment: "page" })).toEqual({
      tone: "warm",
      treatment: "page",
    });
    expect(normalizePdfAppearanceExperiment({ tone: "night", treatment: "surroundings" })).toEqual({
      tone: "night",
      treatment: "surroundings",
    });
  });

  it("stores only the versioned local experiment state", () => {
    const storage = memoryStorage();
    savePdfAppearanceExperiment({ tone: "night", treatment: "page" }, storage);

    expect(storage.length).toBe(1);
    expect(JSON.parse(storage.getItem(PDF_APPEARANCE_EXPERIMENT_KEY)!)).toEqual({
      tone: "night",
      treatment: "page",
    });
    expect(loadPdfAppearanceExperiment(storage)).toEqual({ tone: "night", treatment: "page" });
  });

  it("keeps surroundings exact and applies the bounded page candidates", () => {
    expect(pdfAppearancePageFilter({ tone: "night", treatment: "surroundings" })).toBe("none");
    expect(pdfAppearancePageFilter({ tone: "original", treatment: "page" })).toBe("none");
    expect(pdfAppearancePageFilter({ tone: "warm", treatment: "page" })).toBe("brightness(0.90) sepia(0.06)");
    expect(pdfAppearancePageFilter({ tone: "night", treatment: "page" })).toBe("brightness(0.72)");
  });

  it("recovers from corrupt storage", () => {
    const storage = memoryStorage();
    storage.setItem(PDF_APPEARANCE_EXPERIMENT_KEY, "not-json");
    expect(loadPdfAppearanceExperiment(storage)).toEqual(DEFAULT_PDF_APPEARANCE_EXPERIMENT);
  });
});
