import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadBookAssistantModes, saveBookAssistantMode } from "./bookAssistantMode";

describe("book assistant mode", () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
  });

  it("stores an independent mode for each book", () => {
    saveBookAssistantMode("book-a", "ask");
    saveBookAssistantMode("book-b", "rewrite");
    expect(loadBookAssistantModes()).toEqual({ "book-a": "ask", "book-b": "rewrite" });
  });

  it("drops unknown persisted values", () => {
    values.set("dawn-reader-book-assistant-modes", JSON.stringify({ good: "ask", old: "translate" }));
    expect(loadBookAssistantModes()).toEqual({ good: "ask" });
  });
});
