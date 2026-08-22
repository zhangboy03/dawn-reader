import { readerLocalStorage } from "./clientAccountContext";

export type ReaderTheme = "paper" | "sepia" | "night";
export type PencilMode = "page" | "select";
export type ReaderTextAlign = "justify" | "start";
export type ReaderParagraphStyle = "book" | "spaced";
export type ReaderTypographyMode = "dawn" | "publisher";

export const READER_FONT_SIZES = [16, 18, 20, 22, 24] as const;
export type ReaderFontSize = typeof READER_FONT_SIZES[number];

export type ReaderSettings = {
  fontSize: ReaderFontSize;
  lineHeight: 1.55 | 1.72 | 1.9;
  pageWidth: 660 | 760 | 860;
  theme: ReaderTheme;
  pencilMode: PencilMode;
  textAlign: ReaderTextAlign;
  paragraphStyle: ReaderParagraphStyle;
  typographyMode: ReaderTypographyMode;
};

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontSize: 20,
  lineHeight: 1.55,
  pageWidth: 760,
  theme: "paper",
  pencilMode: "page",
  textAlign: "justify",
  paragraphStyle: "book",
  typographyMode: "dawn",
};

const SETTINGS_KEY = "dawn-reader-settings";

function option<T extends string | number>(value: unknown, values: readonly T[], fallback: T): T {
  return values.includes(value as T) ? value as T : fallback;
}

function nearest<T extends number>(value: unknown, values: readonly T[], fallback: T): T {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return values.reduce((best, candidate) => (
    Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best
  ), fallback);
}

export function normalizeReaderSettings(value: unknown): ReaderSettings {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    fontSize: nearest(raw.fontSize, READER_FONT_SIZES, DEFAULT_READER_SETTINGS.fontSize),
    // Retain the fields for older synced clients, but keep layout decisions in Dawn's renderer.
    lineHeight: DEFAULT_READER_SETTINGS.lineHeight,
    pageWidth: DEFAULT_READER_SETTINGS.pageWidth,
    theme: option(raw.theme, ["paper", "sepia", "night"] as const, DEFAULT_READER_SETTINGS.theme),
    pencilMode: option(raw.pencilMode, ["page", "select"] as const, DEFAULT_READER_SETTINGS.pencilMode),
    textAlign: DEFAULT_READER_SETTINGS.textAlign,
    paragraphStyle: DEFAULT_READER_SETTINGS.paragraphStyle,
    typographyMode: DEFAULT_READER_SETTINGS.typographyMode,
  };
}

export function loadReaderSettings(): ReaderSettings {
  try {
    return normalizeReaderSettings(JSON.parse(readerLocalStorage().getItem(SETTINGS_KEY) ?? "{}"));
  } catch {
    return DEFAULT_READER_SETTINGS;
  }
}

export function saveReaderSettings(settings: ReaderSettings | unknown) {
  readerLocalStorage().setItem(SETTINGS_KEY, JSON.stringify(normalizeReaderSettings(settings)));
}
