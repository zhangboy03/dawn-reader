import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanBookTitle, filterBooksByQuery, migrateStoredBookRecord, sortBooksByRecency } from "./bookStore";

describe("book title cleanup", () => {
  it("removes source-domain suffixes without changing the actual title", () => {
    expect(cleanBookTitle("Zen and the Art of Motorcycle Maintenance (Robert M. Pirsig) (z-library.sk, 1lib.sk, z-lib.sk).epub"))
      .toBe("Zen and the Art of Motorcycle Maintenance (Robert M. Pirsig)");
  });
  it("cleans the supplied Outlive filename", () => {
    expect(cleanBookTitle("Outlive - The Science and Art of Longevity (Peter Attia, MD) (z-library.sk, 1lib.sk, z-lib.sk).epub"))
      .toBe("Outlive - The Science and Art of Longevity (Peter Attia, MD)");
  });
  it("cleans PDF titles without changing the source filename", () => {
    expect(cleanBookTitle("Research paper.pdf")).toBe("Research paper");
  });
});

describe("stored publication migration", () => {
  it("migrates legacy records by extension while preserving EPUB defaults", () => {
    const common = { id: "sha256:a", title: "Title", blob: null, cover: null, addedAt: "2026-08-19T00:00:00.000Z" };
    expect(migrateStoredBookRecord({ ...common, fileName: "paper.pdf" })).toMatchObject({
      format: "pdf", mimeType: "application/pdf", cover: null, coverChecked: false,
    });
    expect(migrateStoredBookRecord({ ...common, fileName: "legacy.epub" })).toMatchObject({
      format: "epub", mimeType: "application/epub+zip",
    });
  });
});

describe("PDF import durability", () => {
  it("persists the original source before optional presentation extraction", () => {
    const source = readFileSync("src/lib/bookStore.ts", "utf8");
    const pdfSave = source.slice(source.indexOf("export async function savePublication"), source.indexOf("export function sortBooksByRecency"));

    expect(pdfSave.indexOf("const stored = await putStoredBook")).toBeGreaterThanOrEqual(0);
    expect(pdfSave).not.toContain("extractPdfPresentation");
    expect(pdfSave).toContain("return stored;");
  });
});

describe("bookshelf recency", () => {
  it("puts the most recently opened book first", () => {
    const books = [
      { title: "newly added", addedAt: "2026-08-18T10:00:00.000Z" },
      { title: "recently opened", addedAt: "2026-08-10T10:00:00.000Z", lastOpenedAt: "2026-08-18T11:00:00.000Z" },
      { title: "older", addedAt: "2026-08-12T10:00:00.000Z", lastOpenedAt: "2026-08-17T10:00:00.000Z" },
    ];
    expect(sortBooksByRecency(books).map((book) => book.title)).toEqual(["recently opened", "newly added", "older"]);
  });
  it("keeps using import time for books that have never been opened", () => {
    const books = [
      { title: "older", addedAt: "2026-08-10T10:00:00.000Z" },
      { title: "newer", addedAt: "2026-08-18T10:00:00.000Z" },
    ];
    expect(sortBooksByRecency(books).map((book) => book.title)).toEqual(["newer", "older"]);
  });
});

describe("bookshelf search", () => {
  const books = [
    { title: "Antifragile", fileName: "antifragile.epub" },
    { title: "How to Trade in Stocks", fileName: "livermore.epub" },
    { title: "美投新手训练营", fileName: "course.epub" },
  ];
  it("matches titles and filenames without changing the shelf order", () => {
    expect(filterBooksByQuery(books, "TRADE stocks").map((book) => book.title)).toEqual(["How to Trade in Stocks"]);
    expect(filterBooksByQuery(books, "livermore").map((book) => book.title)).toEqual(["How to Trade in Stocks"]);
    expect(filterBooksByQuery(books, "美投").map((book) => book.title)).toEqual(["美投新手训练营"]);
  });
  it("returns the full shelf for an empty query", () => {
    expect(filterBooksByQuery(books, "  ")).toBe(books);
  });
});
