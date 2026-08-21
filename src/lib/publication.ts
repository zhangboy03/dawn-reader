import type { StoredBook } from "./bookStore";

export type PublicationFormat = "epub" | "pdf";

export type PdfBookSource = {
  type: "pdf";
  id: string;
  title: string;
  file: File;
};

export function publicationFormat(book: Pick<StoredBook, "format" | "fileName">): PublicationFormat {
  return book.format === "pdf" || /\.pdf$/i.test(book.fileName) ? "pdf" : "epub";
}

export function publicationFormatFromFile(file: Pick<File, "name" | "type">): PublicationFormat | null {
  if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") return "pdf";
  if (/\.epub$/i.test(file.name) || file.type === "application/epub+zip") return "epub";
  return null;
}

export async function hasPdfSignature(blob: Blob) {
  const prefix = new Uint8Array(await blob.slice(0, 1024).arrayBuffer());
  const marker = [0x25, 0x50, 0x44, 0x46, 0x2d];
  return prefix.some((_, index) => marker.every((byte, offset) => prefix[index + offset] === byte));
}

export function isCloudEligiblePublication(book: Pick<StoredBook, "format" | "fileName">) {
  return publicationFormat(book) === "epub";
}

export function shelfFormatLabel(book: Pick<StoredBook, "format" | "fileName">, synced = false) {
  return publicationFormat(book) === "pdf" ? "PDF · 本机" : synced ? "EPUB · 云端" : "EPUB · 本机";
}
