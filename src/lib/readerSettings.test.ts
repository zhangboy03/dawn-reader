import { describe, expect, it } from "vitest";
import { DEFAULT_READER_SETTINGS, normalizeReaderSettings } from "./readerSettings";

describe("reader settings", () => {
  it("migrates old settings to the Dawn typography defaults", () => {
    expect(normalizeReaderSettings({ fontSize: 21, theme: "night" })).toEqual({
      ...DEFAULT_READER_SETTINGS,
      fontSize: 21,
      theme: "night",
    });
  });

  it("maps a synced native line height to the nearest Web option", () => {
    expect(normalizeReaderSettings({ lineHeight: 1.7 }).lineHeight).toBe(1.72);
  });

  it("rejects invalid typography settings", () => {
    expect(normalizeReaderSettings({
      textAlign: "center",
      paragraphStyle: "random",
      typographyMode: "delete-publisher-css",
    })).toMatchObject({
      textAlign: "justify",
      paragraphStyle: "book",
      typographyMode: "dawn",
    });
  });
});
