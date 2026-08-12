import { describe, expect, it } from "vitest";
import { canRestoreDeletedBook, deleteBookResources } from "./deleteBookResources";

describe("book resource deletion", () => {
  it("establishes the deletion barrier before removing payload and state", async () => {
    const order: string[] = [];
    await deleteBookResources({
      deleteObject: async () => { order.push("object"); },
      rememberDeletion: async () => { order.push("tombstone"); },
      deleteRecord: async () => { order.push("record"); },
      deleteProgress: async () => { order.push("progress"); },
    });
    expect(order).toEqual(["tombstone", "object", "record", "progress"]);
  });

  it("keeps the deletion barrier when object cleanup must be retried", async () => {
    const order: string[] = [];
    await expect(deleteBookResources({
      deleteObject: async () => { throw new Error("R2 unavailable"); },
      rememberDeletion: async () => { order.push("tombstone"); },
      deleteRecord: async () => { order.push("record"); },
      deleteProgress: async () => { order.push("progress"); },
    })).rejects.toThrow("R2 unavailable");
    expect(order).toEqual(["tombstone"]);
  });
});

describe("deleted-book restoration", () => {
  it("rejects stale copies but accepts a deliberate later import", () => {
    const deletedAt = "2026-08-12T08:00:00.000Z";
    expect(canRestoreDeletedBook("2026-08-11T08:00:00.000Z", deletedAt)).toBe(false);
    expect(canRestoreDeletedBook("2026-08-12T08:00:00.000Z", deletedAt)).toBe(false);
    expect(canRestoreDeletedBook("2026-08-13T08:00:00.000Z", deletedAt)).toBe(true);
    expect(canRestoreDeletedBook("not-a-date", deletedAt)).toBe(false);
  });
});
