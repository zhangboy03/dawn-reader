import { deleteCachedEpubLocations } from "./epubPagination";
import { readerLocalStorage } from "./clientAccountContext";

const TOMBSTONES_KEY = "dawn-reader-deleted-books";

export function deletedBookIds(storage: Pick<Storage, "getItem"> = readerLocalStorage()) {
  try {
    const value = JSON.parse(storage.getItem(TOMBSTONES_KEY) ?? "[]");
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set<string>();
  }
}

export function rememberDeletedBook(bookId: string, storage: Pick<Storage, "getItem" | "setItem"> = readerLocalStorage()) {
  const ids = deletedBookIds(storage);
  ids.add(bookId);
  storage.setItem(TOMBSTONES_KEY, JSON.stringify([...ids]));
}

export function forgetDeletedBook(bookId: string, storage: Pick<Storage, "getItem" | "setItem"> = readerLocalStorage()) {
  const ids = deletedBookIds(storage);
  ids.delete(bookId);
  storage.setItem(TOMBSTONES_KEY, JSON.stringify([...ids]));
}

export async function deleteBookRemoteFirst({
  bookId,
  synced,
  deleteRemote,
  deleteLocal,
  storage = readerLocalStorage(),
}: {
  bookId: string;
  synced: boolean;
  deleteRemote: () => Promise<unknown>;
  deleteLocal: () => Promise<unknown>;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
}) {
  if (synced) await deleteRemote();
  rememberDeletedBook(bookId, storage);
  await deleteLocal();
  storage.removeItem(`dawn-reader-progress:${bookId}`);
  deleteCachedEpubLocations(bookId, storage);
}
