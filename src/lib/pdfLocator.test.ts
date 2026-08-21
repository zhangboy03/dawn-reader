import { describe, expect, it } from "vitest";
import { normalizePdfLocator, serializePdfLocator } from "./pdfLocator";

describe("PDF locator", () => {
  it("round-trips a versioned PDF position", () => {
    const value = { type: "pdf" as const, version: 1 as const, pageIndex: 8, offset: 0.4, fit: "width" as const, scale: null, updatedAt: new Date().toISOString() };
    expect(normalizePdfLocator(serializePdfLocator(value))).toEqual(value);
  });

  it("rejects EPUB and malformed positions", () => {
    expect(normalizePdfLocator({ cfi: "epubcfi(/6/2)", percentage: 50 })).toBeNull();
    expect(normalizePdfLocator({ type: "pdf", version: 1, pageIndex: -1 })).toBeNull();
  });
});
