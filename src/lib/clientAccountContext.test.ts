import { beforeEach, describe, expect, it } from "vitest";
import {
  accountDatabaseName,
  configureClientAccountContext,
  readerLocalStorage,
} from "./clientAccountContext";
import { claimLegacyLocalStorage } from "./legacyLocalData";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe("account-scoped browser storage", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = memoryStorage();
  });

  it("keeps identical keys and database names separate for two accounts", () => {
    configureClientAccountContext({ accountId: "account-a", environment: "beta", canClaimLegacyLocalData: false, role: "reader", authKind: "dawn_session" });
    const accountA = readerLocalStorage(storage);
    accountA.setItem("dawn-reader-progress:book", "A");
    const databaseA = accountDatabaseName("dawn-reader-library", 3);

    configureClientAccountContext({ accountId: "account-b", environment: "beta", canClaimLegacyLocalData: false, role: "reader", authKind: "dawn_session" });
    const accountB = readerLocalStorage(storage);
    accountB.setItem("dawn-reader-progress:book", "B");
    const databaseB = accountDatabaseName("dawn-reader-library", 3);

    expect(accountA.getItem("dawn-reader-progress:book")).toBe("A");
    expect(accountB.getItem("dawn-reader-progress:book")).toBe("B");
    expect(databaseA).not.toBe(databaseB);
  });

  it("copies legacy keys only after an explicit claim and leaves the source intact", () => {
    storage.setItem("dawn-reader-profile", JSON.stringify({ preset: "balanced" }));
    storage.setItem("unrelated", "keep");
    configureClientAccountContext({ accountId: "owner", environment: "beta", canClaimLegacyLocalData: true, role: "owner", authKind: "chatgpt" });

    expect(readerLocalStorage(storage).getItem("dawn-reader-profile")).toBeNull();
    expect(claimLegacyLocalStorage(storage)).toBe(1);
    expect(readerLocalStorage(storage).getItem("dawn-reader-profile")).toContain("balanced");
    expect(storage.getItem("dawn-reader-profile")).toContain("balanced");
    expect(storage.getItem("unrelated")).toBe("keep");
  });
});
