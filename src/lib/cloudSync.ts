import type { StoredBook } from "./bookStore";
import type { ReaderSettings } from "./readerSettings";
import type { ReadingPosition } from "./readingPosition";
import type { ReaderProfile } from "./storage";

export type CloudBook = {
  id: string;
  title: string;
  fileName: string;
  fileSize: number;
  contentHash: string | null;
  addedAt: string;
  updatedAt: string;
};

export type CloudState = {
  profile: ReaderProfile | null;
  settings: ReaderSettings | null;
  updatedAt: string | null;
};

async function jsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(body?.error ?? `Sync failed (${response.status}).`);
  return body as T;
}

export async function loadCloudState() {
  return jsonResponse<CloudState>(await fetch("/api/state", { cache: "no-store" }));
}

export async function saveCloudState(state: { profile?: ReaderProfile; settings?: ReaderSettings }) {
  return jsonResponse<{ updatedAt: string }>(await fetch("/api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  }));
}

export async function listCloudBooks() {
  const result = await jsonResponse<{ books: CloudBook[] }>(await fetch("/api/books", { cache: "no-store" }));
  return result.books;
}

export async function uploadCloudBook(book: StoredBook) {
  if (!book.blob) throw new Error("The EPUB is not cached on this device.");
  const file = new File([book.blob], book.fileName, { type: "application/epub+zip" });
  const form = new FormData();
  form.set("id", book.id);
  form.set("title", book.title);
  form.set("addedAt", book.addedAt);
  if (book.id.startsWith("sha256:")) form.set("contentHash", book.id.slice("sha256:".length));
  form.set("file", file);
  return jsonResponse<{ id: string; syncedAt: string }>(await fetch("/api/books", {
    method: "POST",
    body: form,
  }));
}

export async function downloadCloudBook(book: CloudBook) {
  const response = await fetch(`/api/books/${encodeURIComponent(book.id)}/file`, { cache: "no-store" });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? "Book download failed.");
  }
  return new File([await response.blob()], book.fileName, { type: "application/epub+zip" });
}

export async function loadCloudProgress(bookId: string) {
  const result = await jsonResponse<{ position: ReadingPosition | null }>(await fetch(
    `/api/books/${encodeURIComponent(bookId)}/progress`,
    { cache: "no-store" },
  ));
  return result.position;
}

export async function saveCloudProgress(bookId: string, position: ReadingPosition) {
  const result = await jsonResponse<{ position: ReadingPosition }>(await fetch(
    `/api/books/${encodeURIComponent(bookId)}/progress`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cfi: position.cfi,
        percentage: position.percentage,
        updatedAt: position.updatedAt,
      }),
    },
  ));
  return result.position;
}
