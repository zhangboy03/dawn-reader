const DB_NAME = "dawn-reader-library";
const STORE_NAME = "books";
const DB_VERSION = 1;

export type StoredBook = {
  id: string;
  title: string;
  fileName: string;
  blob: Blob | null;
  addedAt: string;
};

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

export function cleanBookTitle(fileName: string) {
  return fileName
    .replace(/\.epub$/i, "")
    .replace(/\s*\((?:z-library\.sk|1lib\.sk|z-lib\.sk)(?:\s*,\s*(?:z-library\.sk|1lib\.sk|z-lib\.sk))*\)\s*$/i, "")
    .trim();
}

export async function saveEpub(file: File) {
  const db = await openLibrary();
  const id = `${file.name}:${file.size}:${file.lastModified}`;
  const record: StoredBook = {
    id,
    title: cleanBookTitle(file.name),
    fileName: file.name,
    blob: file,
    addedAt: new Date().toISOString(),
  };
  const transaction = db.transaction(STORE_NAME, "readwrite");
  await requestResult(transaction.objectStore(STORE_NAME).put(record));
  db.close();
  return record;
}

export async function listStoredBooks() {
  const db = await openLibrary();
  const transaction = db.transaction(STORE_NAME, "readonly");
  const records = await requestResult(transaction.objectStore(STORE_NAME).getAll()) as StoredBook[];
  db.close();
  return records.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

export function storedBookFile(book: StoredBook) {
  if (!book.blob) throw new Error("The book is not cached on this device.");
  return new File([book.blob], book.fileName, { type: "application/epub+zip" });
}

export async function cacheStoredBook(book: StoredBook, blob: Blob) {
  const db = await openLibrary();
  const record = { ...book, blob };
  const transaction = db.transaction(STORE_NAME, "readwrite");
  await requestResult(transaction.objectStore(STORE_NAME).put(record));
  db.close();
  return record;
}
