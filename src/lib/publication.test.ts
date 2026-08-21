import { describe, expect, it } from "vitest";
import {
  hasPdfSignature,
  isCloudEligiblePublication,
  publicationFormat,
  publicationFormatFromFile,
  shelfFormatLabel,
} from "./publication";

describe("publication format boundary", () => {
  it("defaults legacy records to EPUB and keeps PDFs local", () => {
    expect(publicationFormat({ fileName: "legacy.epub" })).toBe("epub");
    expect(publicationFormat({ fileName: "legacy.pdf" })).toBe("pdf");
    expect(isCloudEligiblePublication({ fileName: "paper.pdf", format: "pdf" })).toBe(false);
    expect(shelfFormatLabel({ fileName: "paper.pdf", format: "pdf" })).toBe("PDF · 本机");
    expect(shelfFormatLabel({ fileName: "book.epub" }, true)).toBe("EPUB · 云端");
  });

  it("recognizes import formats without treating arbitrary files as EPUB", () => {
    expect(publicationFormatFromFile({ name: "paper.PDF", type: "" })).toBe("pdf");
    expect(publicationFormatFromFile({ name: "book", type: "application/epub+zip" })).toBe("epub");
    expect(publicationFormatFromFile({ name: "notes.txt", type: "text/plain" })).toBeNull();
  });

  it("checks the PDF signature before local persistence", async () => {
    expect(await hasPdfSignature(new Blob(["%PDF-1.7\nfixture"]))).toBe(true);
    expect(await hasPdfSignature(new Blob(["not a pdf"]))).toBe(false);
  });
});
