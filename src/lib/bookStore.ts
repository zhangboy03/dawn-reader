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
};

type EpubPresentation = {
  title: string | null;
  cover: Blob | null;
};

export async function epubContentHash(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

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
    .replace(/\.epub$/i, "")
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
    return {
      title: metadata?.title?.trim() || null,
      cover,
    };
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

export async function saveEpub(file: File) {
  const db = await openLibrary();
  const id = `sha256:${await epubContentHash(file)}`;
  const lookup = db.transaction(STORE_NAME, "readonly");
  const existing = await requestResult(lookup.objectStore(STORE_NAME).get(id)) as StoredBook | undefined;
  db.close();
  let presentation: EpubPresentation | null = null;
  try {
    presentation = await extractEpubPresentation(file);
  } catch {
    // A readable EPUB can still be imported when its presentation metadata is malformed.
  }
  const record: StoredBook = {
    id,
    title: presentation?.title ?? existing?.title ?? cleanBookTitle(file.name),
    fileName: file.name,
    blob: file,
    cover: presentation?.cover ?? existing?.cover ?? null,
    coverChecked: Boolean(presentation) || existing?.coverChecked,
    addedAt: existing?.addedAt ?? new Date().toISOString(),
  };
  return putStoredBook(record);
}

export async function listStoredBooks() {
  const db = await openLibrary();
  const transaction = db.transaction(STORE_NAME, "readonly");
  const records = await requestResult(transaction.objectStore(STORE_NAME).getAll()) as StoredBook[];
  db.close();
  return records.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
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
  return new File([book.blob], book.fileName, { type: "application/epub+zip" });
}

export async function cacheStoredBook(book: StoredBook, blob: Blob) {
  return putStoredBook({
    id: book.id,
    title: book.title,
    fileName: book.fileName,
    blob,
    cover: book.cover ?? null,
    coverChecked: book.coverChecked,
    addedAt: book.addedAt,
  });
}

export async function hydrateStoredBookPresentation(book: StoredBook, blob = book.blob) {
  if (!blob) throw new Error("The book is not cached on this device.");
  const presentation = await extractEpubPresentation(blob);
  return putStoredBook({
    id: book.id,
    title: presentation.title ?? book.title,
    fileName: book.fileName,
    blob,
    cover: presentation.cover,
    coverChecked: true,
    addedAt: book.addedAt,
  });
}
