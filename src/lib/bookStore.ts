import { hasPdfSignature, publicationFormatFromFile } from "./publication";
import type { PdfPresentation } from "./pdfPresentation";

const DB_NAME = "dawn-reader-library";
const STORE_NAME = "books";
const DB_VERSION = 1;

export type StoredBook = {
  id: string;
  title: string;
  fileName: string;
  blob: Blob | null;
  cover?: Blob | null;
  coverChecked?: boolean;
  addedAt: string;
  lastOpenedAt?: string;
  format?: "epub" | "pdf";
  mimeType?: string;
  fileSize?: number;
  paperAuthor?: string | null;
  paperYear?: string | null;
  pageCount?: number | null;
};

type EpubPresentation = {
  title: string | null;
  cover: Blob | null;
};

export async function publicationContentHash(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const epubContentHash = publicationContentHash;

function openLibrary() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionFinished(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

export function cleanBookTitle(fileName: string) {
  return fileName
    .replace(/\.(?:epub|pdf)$/i, "")
    .replace(/\s*\((?:z-library\.sk|1lib\.sk|z-lib\.sk)(?:\s*,\s*(?:z-library\.sk|1lib\.sk|z-lib\.sk))*\)\s*$/i, "")
    .trim();
}

export async function extractEpubPresentation(blob: Blob): Promise<EpubPresentation> {
  const epubModule = await import("epubjs") as any;
  const ePub = epubModule.default?.default ?? epubModule.default;
  const book = ePub(await blob.arrayBuffer(), { replacements: "none" });
  try {
    await book.opened;
    const metadata = await book.loaded.metadata.catch(() => null) as { title?: string } | null;
    const coverUrl = await book.coverUrl().catch(() => null);
    let cover: Blob | null = null;
    if (coverUrl) {
      try {
        const response = await fetch(coverUrl);
        if (response.ok) cover = await response.blob();
      } catch {
        // Keep usable metadata even when an embedded cover cannot be decoded.
      }
    }
    return { title: metadata?.title?.trim() || null, cover };
  } finally {
    book.destroy?.();
  }
}

async function putStoredBook(record: StoredBook) {
  const db = await openLibrary();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  const finished = transactionFinished(transaction);
  transaction.objectStore(STORE_NAME).put(record);
  await finished;
  db.close();
  return record;
}

async function storedBookById(id: string) {
  const db = await openLibrary();
  const lookup = db.transaction(STORE_NAME, "readonly");
  const existing = await requestResult(lookup.objectStore(STORE_NAME).get(id)) as StoredBook | undefined;
  db.close();
  return existing;
}

export async function saveEpub(file: File) {
  const id = `sha256:${await publicationContentHash(file)}`;
  const existing = await storedBookById(id);
  let presentation: EpubPresentation | null = null;
  try {
    presentation = await extractEpubPresentation(file);
  } catch {
    // A readable EPUB can still be imported when presentation metadata is malformed.
  }
  return putStoredBook({
    id,
    title: presentation?.title ?? existing?.title ?? cleanBookTitle(file.name),
    fileName: file.name,
    blob: file,
    cover: presentation?.cover ?? existing?.cover ?? null,
    coverChecked: Boolean(presentation) || existing?.coverChecked,
    addedAt: existing?.addedAt ?? new Date().toISOString(),
    lastOpenedAt: existing?.lastOpenedAt,
    format: "epub",
    mimeType: "application/epub+zip",
    fileSize: file.size,
  });
}

export async function savePublication(file: File) {
  const format = publicationFormatFromFile(file);
  if (format === "epub") return saveEpub(file);
  if (format !== "pdf") throw new Error("不支持的文件格式。");
  if (!await hasPdfSignature(file)) throw new Error("这个文件没有有效的 PDF 标识，未保存到书架。");

  const id = `sha256:${await publicationContentHash(file)}`;
  const existing = await storedBookById(id);
  let presentation: PdfPresentation | null = null;
  try {
    const { extractPdfPresentation } = await import("./pdfPresentation");
    presentation = await extractPdfPresentation(file);
  } catch {
    // Keep the source PDF usable when its first page or metadata cannot be rendered.
  }
  return putStoredBook({
    id,
    title: presentation?.title ?? existing?.title ?? cleanBookTitle(file.name),
    fileName: file.name,
    blob: file,
    cover: presentation?.cover ?? existing?.cover ?? null,
    coverChecked: Boolean(presentation) || existing?.coverChecked,
    addedAt: existing?.addedAt ?? new Date().toISOString(),
    lastOpenedAt: existing?.lastOpenedAt,
    format: "pdf",
    mimeType: "application/pdf",
    fileSize: file.size,
    paperAuthor: presentation?.author ?? existing?.paperAuthor ?? null,
    paperYear: presentation?.year ?? existing?.paperYear ?? null,
    pageCount: presentation?.pageCount ?? existing?.pageCount ?? null,
  });
}

export function sortBooksByRecency<T extends Pick<StoredBook, "addedAt" | "lastOpenedAt">>(books: T[]) {
  return [...books].sort((a, b) => {
    const recentDifference = (b.lastOpenedAt ?? b.addedAt).localeCompare(a.lastOpenedAt ?? a.addedAt);
    return recentDifference || b.addedAt.localeCompare(a.addedAt);
  });
}

export function filterBooksByQuery<T extends Pick<StoredBook, "title" | "fileName">>(books: T[], query: string) {
  const terms = query.normalize("NFKC").toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return books;
  return books.filter((book) => {
    const searchable = `${book.title} ${book.fileName}`.normalize("NFKC").toLocaleLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
}

export function migrateStoredBookRecord(book: StoredBook): StoredBook {
  const format = book.format === "pdf" || /\.pdf$/i.test(book.fileName) ? "pdf" : "epub";
  return {
    ...book,
    format,
    mimeType: book.mimeType ?? (format === "pdf" ? "application/pdf" : "application/epub+zip"),
    fileSize: book.fileSize ?? book.blob?.size,
    cover: book.cover ?? null,
    coverChecked: format === "pdf" ? Boolean(book.cover) : book.coverChecked,
  };
}

export async function listStoredBooks() {
  const db = await openLibrary();
  const transaction = db.transaction(STORE_NAME, "readonly");
  const records = await requestResult(transaction.objectStore(STORE_NAME).getAll()) as StoredBook[];
  db.close();
  return sortBooksByRecency(records.map(migrateStoredBookRecord));
}

export async function markStoredBookOpened(book: StoredBook, openedAt = new Date().toISOString()) {
  return putStoredBook({ ...book, lastOpenedAt: openedAt, fileSize: book.fileSize ?? book.blob?.size });
}

export async function deleteStoredBook(id: string) {
  const db = await openLibrary();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  const finished = transactionFinished(transaction);
  transaction.objectStore(STORE_NAME).delete(id);
  await finished;
  db.close();
}

export function storedBookFile(book: StoredBook) {
  if (!book.blob) throw new Error("The book is not cached on this device.");
  const pdf = book.format === "pdf" || /\.pdf$/i.test(book.fileName);
  return new File([book.blob], book.fileName, {
    type: book.mimeType ?? (pdf ? "application/pdf" : "application/epub+zip"),
  });
}

export async function cacheStoredBook(book: StoredBook, blob: Blob) {
  return putStoredBook({ ...book, blob, cover: book.cover ?? null, fileSize: blob.size });
}

export async function hydrateStoredBookPresentation(book: StoredBook, blob = book.blob) {
  if (!blob) throw new Error("The book is not cached on this device.");
  const presentation = await extractEpubPresentation(blob);
  return putStoredBook({
    ...book,
    title: presentation.title ?? book.title,
    blob,
    cover: presentation.cover,
    coverChecked: true,
    format: "epub",
    mimeType: "application/epub+zip",
    fileSize: blob.size,
  });
}

export async function hydrateStoredPdfPresentation(book: StoredBook, blob = book.blob) {
  if (!blob) throw new Error("The paper is not cached on this device.");
  const { extractPdfPresentation } = await import("./pdfPresentation");
  const presentation = await extractPdfPresentation(blob);
  return putStoredBook({
    ...book,
    title: presentation.title ?? book.title,
    blob,
    cover: presentation.cover,
    coverChecked: true,
    format: "pdf",
    mimeType: "application/pdf",
    fileSize: blob.size,
    paperAuthor: presentation.author,
    paperYear: presentation.year,
    pageCount: presentation.pageCount,
  });
}
