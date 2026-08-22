import { describe, expect, it } from "vitest";
import {
  LEGACY_PDF_APPEARANCE_EXPERIMENT_KEY,
  loadLegacyPdfAppearanceTheme,
  pdfAppearancePageFilter,
  pdfAppearanceTone,
} from "./pdfAppearance";

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

describe("PDF appearance", () => {
  it("maps the shared reading themes to PDF vocabulary", () => {
    expect(pdfAppearanceTone("paper")).toBe("original");
    expect(pdfAppearanceTone("sepia")).toBe("warm");
    expect(pdfAppearanceTone("night")).toBe("night");
  });

  it("keeps Original exact and applies the accepted page filters", () => {
    expect(pdfAppearancePageFilter("paper")).toBe("none");
    expect(pdfAppearancePageFilter("sepia")).toBe("brightness(0.90) sepia(0.06)");
    expect(pdfAppearancePageFilter("night")).toBe("brightness(0.72)");
  });

  it("carries the selected comparison tone into the shared theme without deleting it", () => {
    const storage = memoryStorage();
    storage.setItem(LEGACY_PDF_APPEARANCE_EXPERIMENT_KEY, JSON.stringify({ tone: "night", treatment: "page" }));

    expect(loadLegacyPdfAppearanceTheme(storage)).toBe("night");
    expect(storage.getItem(LEGACY_PDF_APPEARANCE_EXPERIMENT_KEY)).not.toBeNull();
  });

  it("ignores missing or corrupt comparison state", () => {
    const storage = memoryStorage();
    expect(loadLegacyPdfAppearanceTheme(storage)).toBeNull();
    storage.setItem(LEGACY_PDF_APPEARANCE_EXPERIMENT_KEY, "not-json");
    expect(loadLegacyPdfAppearanceTheme(storage)).toBeNull();
  });
});
