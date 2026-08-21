import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createPdfBlobRangeTransport, LOCAL_PDF_RANGE_CHUNK_BYTES } from "./pdfBlobRangeTransport";

class FakeRangeTransport {
  chunks: Array<{ begin: number; chunk: Uint8Array | null }> = [];

  constructor(
    readonly length: number,
    readonly initialData: Uint8Array | null,
    readonly progressiveDone = false,
    readonly contentDispositionFilename = "",
  ) {}

  onDataRange(begin: number, chunk: Uint8Array | null) {
    this.chunks.push({ begin, chunk });
  }
}

describe("local PDF range transport", () => {
  it("reads only the requested Blob slice", async () => {
    const transport = createPdfBlobRangeTransport(FakeRangeTransport, new Blob([new Uint8Array([1, 2, 3, 4, 5])]), "paper.pdf");
    transport.requestDataRange(1, 4);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(transport.length).toBe(5);
    expect(transport.progressiveDone).toBe(true);
    expect(transport.contentDispositionFilename).toBe("paper.pdf");
    expect([...transport.chunks[0].chunk!]).toEqual([2, 3, 4]);
    expect(LOCAL_PDF_RANGE_CHUNK_BYTES).toBe(256 * 1024);
  });

  it("does not deliver a pending slice after abort", async () => {
    const transport = createPdfBlobRangeTransport(FakeRangeTransport, new Blob([new Uint8Array([1, 2, 3])]), "paper.pdf");
    transport.requestDataRange(0, 3);
    transport.abort();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(transport.chunks).toEqual([]);
  });

  it("opens a real PDF through PDF.js without a whole-file data parameter", async () => {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const bytes = await readFile(resolve(process.cwd(), "public/test-fixtures/pdf-mvp-smoke.pdf"));
    const file = new Blob([bytes], { type: "application/pdf" });
    const range = createPdfBlobRangeTransport(pdfjsLib.PDFDataRangeTransport, file, "pdf-mvp-smoke.pdf");
    const loadingTask = pdfjsLib.getDocument({
      range,
      rangeChunkSize: LOCAL_PDF_RANGE_CHUNK_BYTES,
      disableStream: true,
      disableAutoFetch: true,
    });
    const document = await loadingTask.promise;
    try {
      expect(document.numPages).toBe(1);
      expect(await document.getPage(1)).toBeTruthy();
    } finally {
      await loadingTask.destroy();
    }
  });
});
