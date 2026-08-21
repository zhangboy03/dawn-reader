import { describe, expect, it } from "vitest";
import { isDawnStorageKey } from "./localAccountData";

describe("local account data ownership", () => {
  it("matches only Dawn Reader storage keys", () => {
    expect(isDawnStorageKey("dawn-reader-progress:book")).toBe(true);
    expect(isDawnStorageKey("another-app-progress")).toBe(false);
  });
});
