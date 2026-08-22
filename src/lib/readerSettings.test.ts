import { describe, expect, it } from "vitest";
import { DEFAULT_READER_SETTINGS, READER_FONT_SIZES, normalizeReaderSettings } from "./readerSettings";

describe("reader settings", () => {
  it("migrates old settings to the five-step Dawn typography defaults", () => {
    expect(normalizeReaderSettings({ fontSize: 21, theme: "night" })).toEqual({
      ...DEFAULT_READER_SETTINGS,
      fontSize: 20,
      theme: "night",
    });
  });

  it("retires saved typography controls in favor of Dawn defaults", () => {
    expect(normalizeReaderSettings({
      lineHeight: 1.9,
      pageWidth: 860,
      textAlign: "start",
      paragraphStyle: "spaced",
      typographyMode: "publisher",
    })).toMatchObject({
      lineHeight: 1.55,
      pageWidth: 760,
      textAlign: "justify",
      paragraphStyle: "book",
      typographyMode: "dawn",
    });
  });

  it("offers five quiet font steps with the middle size as the default", () => {
    expect(READER_FONT_SIZES).toEqual([16, 18, 20, 22, 24]);
    expect(DEFAULT_READER_SETTINGS.fontSize).toBe(READER_FONT_SIZES[2]);
    expect(normalizeReaderSettings({ fontSize: 19 }).fontSize).toBe(20);
    expect(normalizeReaderSettings({ fontSize: 22.4 }).fontSize).toBe(22);
    expect(normalizeReaderSettings({ fontSize: 99 }).fontSize).toBe(24);
  });
});
