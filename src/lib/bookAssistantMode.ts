export type BookAssistantMode = "rewrite" | "ask";

const STORAGE_KEY = "dawn-reader-book-assistant-modes";

export function loadBookAssistantModes(): Record<string, BookAssistantMode> {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, BookAssistantMode] => entry[1] === "rewrite" || entry[1] === "ask"),
    );
  } catch {
    return {};
  }
}

export function saveBookAssistantMode(bookId: string, mode: BookAssistantMode) {
  const modes = loadBookAssistantModes();
  modes[bookId] = mode;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(modes));
  return modes;
}
