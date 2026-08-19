import { describe, expect, it, vi } from "vitest";
import { deleteBookRemoteFirst, deletedBookIds } from "./bookDeletion";
import { epubLocationCacheKey } from "./epubPagination";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe("safe book deletion", () => {
  it("waits for the cloud before removing the local copy", async () => {
    const order: string[] = [];
    const storage = memoryStorage();
    storage.setItem("dawn-reader-progress:book-1", "saved");
    storage.setItem(epubLocationCacheKey("book-1"), '["epubcfi(/6/2)","epubcfi(/6/4)"]');

    await deleteBookRemoteFirst({
      bookId: "book-1",
      synced: true,
      deleteRemote: async () => { order.push("remote"); },
      deleteLocal: async () => { order.push("local"); },
      storage,
    });

    expect(order).toEqual(["remote", "local"]);
    expect(deletedBookIds(storage)).toEqual(new Set(["book-1"]));
    expect(storage.getItem("dawn-reader-progress:book-1")).toBeNull();
    expect(storage.getItem(epubLocationCacheKey("book-1"))).toBeNull();
  });

  it("does not hide a local book when cloud deletion fails", async () => {
    const storage = memoryStorage();
    const deleteLocal = vi.fn();
    await expect(deleteBookRemoteFirst({
      bookId: "book-1",
      synced: true,
      deleteRemote: async () => { throw new Error("offline"); },
      deleteLocal,
      storage,
    })).rejects.toThrow("offline");
    expect(deleteLocal).not.toHaveBeenCalled();
    expect(deletedBookIds(storage).size).toBe(0);
  });
});
