import { hasPdfSignature, publicationFormatFromFile } from "./publication";
import { accountDatabaseName } from "./clientAccountContext";

const LEGACY_DB_NAME = "dawn-reader-library";
const STORE_NAME = "books";
const RECENCY_STORE_NAME = "book-recency";
const DB_VERSION = 2;

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

type StoredBookRecency = {
  id: string;
  lastOpenedAt: string;
};

export async function publicationContentHash(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const epubContentHash = publicationContentHash;

function openLibraryByName(databaseName: string) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
      if (!request.result.objectStoreNames.contains(RECENCY_STORE_NAME)) {
        request.result.createObjectStore(RECENCY_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openLibrary() {
  return openLibraryByName(accountDatabaseName(LEGACY_DB_NAME, 3));
}

async function databaseExists(databaseName: string) {
  if (typeof indexedDB.databases !== "function") return false;
  return (await indexedDB.databases()).some((database) => database.name === databaseName);
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
  const stored = await putStoredBook({
    id,
    title: existing?.title ?? cleanBookTitle(file.name),
    fileName: file.name,
    blob: file,
    cover: existing?.cover ?? null,
    coverChecked: existing?.coverChecked ?? false,
    addedAt: existing?.addedAt ?? new Date().toISOString(),
    lastOpenedAt: existing?.lastOpenedAt,
    format: "pdf",
    mimeType: "application/pdf",
    fileSize: file.size,
    paperAuthor: existing?.paperAuthor ?? null,
    paperYear: existing?.paperYear ?? null,
    pageCount: existing?.pageCount ?? null,
  });

  // Library hydration enriches presentation metadata after this durable import
  // boundary and updates the visible shelf without blocking the original PDF.
  return stored;
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
  const transaction = db.transaction([STORE_NAME, RECENCY_STORE_NAME], "readonly");
  const [records, recency] = await Promise.all([
    requestResult(transaction.objectStore(STORE_NAME).getAll()) as Promise<StoredBook[]>,
    requestResult(transaction.objectStore(RECENCY_STORE_NAME).getAll()) as Promise<StoredBookRecency[]>,
  ]);
  db.close();
  const openedById = new Map(recency.map((entry) => [entry.id, entry.lastOpenedAt]));
  return sortBooksByRecency(records.map((record) => migrateStoredBookRecord({
    ...record,
    lastOpenedAt: openedById.get(record.id) ?? record.lastOpenedAt,
  })));
}

async function legacyLibraryRecords() {
  if (!await databaseExists(LEGACY_DB_NAME)) return { books: [] as StoredBook[], recency: [] as StoredBookRecency[] };
  const database = await openLibraryByName(LEGACY_DB_NAME);
  if (!database.objectStoreNames.contains(STORE_NAME)) {
    database.close();
    return { books: [] as StoredBook[], recency: [] as StoredBookRecency[] };
  }
  const stores = database.objectStoreNames.contains(RECENCY_STORE_NAME)
    ? [STORE_NAME, RECENCY_STORE_NAME]
    : [STORE_NAME];
  const transaction = database.transaction(stores, "readonly");
  const books = await requestResult(transaction.objectStore(STORE_NAME).getAll()) as StoredBook[];
  const recency = database.objectStoreNames.contains(RECENCY_STORE_NAME)
    ? await requestResult(transaction.objectStore(RECENCY_STORE_NAME).getAll()) as StoredBookRecency[]
    : [];
  database.close();
  return { books, recency };
}

export async function legacyStoredBookCount() {
  return (await legacyLibraryRecords()).books.length;
}

export async function claimLegacyStoredBooks() {
  const legacy = await legacyLibraryRecords();
  if (!legacy.books.length && !legacy.recency.length) return 0;
  const database = await openLibrary();
  const transaction = database.transaction([STORE_NAME, RECENCY_STORE_NAME], "readwrite");
  const finished = transactionFinished(transaction);
  for (const book of legacy.books) transaction.objectStore(STORE_NAME).put(book);
  for (const recency of legacy.recency) transaction.objectStore(RECENCY_STORE_NAME).put(recency);
  await finished;
  database.close();
  return legacy.books.length;
}

export async function markStoredBookOpened(bookId: string, openedAt = new Date().toISOString()) {
  const db = await openLibrary();
  const transaction = db.transaction(RECENCY_STORE_NAME, "readwrite");
  const finished = transactionFinished(transaction);
  const record: StoredBookRecency = { id: bookId, lastOpenedAt: openedAt };
  transaction.objectStore(RECENCY_STORE_NAME).put(record);
  await finished;
  db.close();
  return record;
}

export async function deleteStoredBook(id: string) {
  const db = await openLibrary();
  const transaction = db.transaction([STORE_NAME, RECENCY_STORE_NAME], "readwrite");
  const finished = transactionFinished(transaction);
  transaction.objectStore(STORE_NAME).delete(id);
  transaction.objectStore(RECENCY_STORE_NAME).delete(id);
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
