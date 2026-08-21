import { describe, expect, it } from "vitest";
import {
  DAWN_YELLOW,
  PDF_HIGHLIGHT_SCHEMA_VERSION,
  addPdfHighlight,
  clientRectToPdfQuad,
  deletePdfHighlightSidecar,
  loadPdfHighlightSidecar,
  pdfHighlightQuarantineStorageKey,
  pdfHighlightStorageKey,
  pdfQuadToViewportRect,
  removePdfHighlight,
  type PdfHighlight,
} from "./pdfHighlights";

function memoryStorage(initial: Record<string, string> = {}) {
  return {
    values: new Map(Object.entries(initial)),
    getItem(key: string) { return this.values.get(key) ?? null; },
    setItem(key: string, value: string) { this.values.set(key, value); },
    removeItem(key: string) { this.values.delete(key); },
    value(key: string) { return this.values.get(key) ?? null; },
  };
}

const highlight: PdfHighlight = {
  id: "highlight-1",
  pageIndex: 0,
  text: "selected passage",
  color: DAWN_YELLOW,
  createdAt: "2026-08-19T00:00:00.000Z",
  quads: [{ x1: 10, y1: 20, x2: 30, y2: 40 }],
};

describe("PDF highlight sidecars", () => {
  it("persists, deduplicates, removes and cascades the sidecar", () => {
    const storage = memoryStorage();
    const created = addPdfHighlight("sha256:pdf", highlight, storage);
    const duplicate = addPdfHighlight("sha256:pdf", { ...highlight, id: "highlight-2" }, storage);

    expect(created.highlights).toHaveLength(1);
    expect(duplicate.highlights).toHaveLength(1);
    expect(loadPdfHighlightSidecar("sha256:pdf", storage).version).toBe(PDF_HIGHLIGHT_SCHEMA_VERSION);

    const removed = removePdfHighlight("sha256:pdf", highlight.id, storage);
    expect(removed?.highlights).toHaveLength(0);

    deletePdfHighlightSidecar("sha256:pdf", storage);
    expect(storage.value(pdfHighlightStorageKey("sha256:pdf"))).toBeNull();
    expect(storage.value(pdfHighlightQuarantineStorageKey("sha256:pdf"))).toBeNull();
  });

  it("converts client rectangles to normalized page-local PDF quads", () => {
    const pageRect = { left: 100, top: 200, width: 200, height: 300 } as DOMRect;
    const clientRect = { left: 110, top: 220, right: 160, bottom: 250 } as DOMRect;
    const viewport = {
      convertToPdfPoint: (x: number, y: number) => [x / 2, y / 2] as [number, number],
    };

    expect(clientRectToPdfQuad(clientRect, pageRect, viewport)).toEqual({
      x1: 5,
      y1: 10,
      x2: 30,
      y2: 25,
    });
  });

  it("replays rotated quads using the supported PDF.js 6 point API", () => {
    const viewport = {
      convertToViewportPoint: (x: number, y: number) => [100 - y, x] as [number, number],
    };
    expect(pdfQuadToViewportRect({ x1: 20, y1: 30, x2: 40, y2: 70 }, viewport)).toEqual({
      left: 30,
      top: 20,
      width: 40,
      height: 20,
    });
  });

  it("migrates the actual schema-v1 bookId/quads shape while quarantining malformed geometry", () => {
    const key = pdfHighlightStorageKey("sha256:legacy");
    const storage = memoryStorage({
      [key]: JSON.stringify({
        version: 1,
        // CONTEXT_BASELINE schema v1 stored bookId plus PDF-coordinate quads.
        bookId: "sha256:legacy",
        updatedAt: "2026-08-18T00:00:00.000Z",
        highlights: [
          { ...highlight, color: "#ffed00" },
          { ...highlight, id: "bad", quads: [{ x1: "NaN", y1: 1, x2: 2, y2: 3 }] },
        ],
      }),
    });

    const result = loadPdfHighlightSidecar("sha256:legacy", storage);
    expect(result.version).toBe(PDF_HIGHLIGHT_SCHEMA_VERSION);
    expect(result.highlights).toHaveLength(1);
    expect(result.highlights[0].color).toBe(DAWN_YELLOW);
    expect(result.recovery).toEqual({ discarded: 1, migratedFrom: 1 });
    expect(storage.value(pdfHighlightQuarantineStorageKey("sha256:legacy"))).toContain("bad");
  });

  it("quarantines an unreadable sidecar instead of throwing during reopen", () => {
    const key = pdfHighlightStorageKey("sha256:broken");
    const storage = memoryStorage({ [key]: "{definitely-not-json" });

    let result: ReturnType<typeof loadPdfHighlightSidecar> | undefined;
    expect(() => { result = loadPdfHighlightSidecar("sha256:broken", storage); }).not.toThrow();
    expect(result?.highlights).toHaveLength(0);
    expect(result?.recovery).toEqual({ discarded: 1, migratedFrom: null });
    expect(storage.value(key)).toBeNull();
    expect(storage.value(pdfHighlightQuarantineStorageKey("sha256:broken"))).toContain("definitely-not-json");
  });
});
