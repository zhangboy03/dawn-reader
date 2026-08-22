import { readerLocalStorage } from "./clientAccountContext";

export type ReaderTheme = "paper" | "sepia" | "night";
export type PencilMode = "page" | "select";
export type ReaderTextAlign = "justify" | "start";
export type ReaderParagraphStyle = "book" | "spaced";
export type ReaderTypographyMode = "dawn" | "publisher";

export type ReaderSettings = {
  fontSize: 17 | 19 | 21;
  lineHeight: 1.55 | 1.72 | 1.9;
  pageWidth: 660 | 760 | 860;
  theme: ReaderTheme;
  pencilMode: PencilMode;
  textAlign: ReaderTextAlign;
  paragraphStyle: ReaderParagraphStyle;
  typographyMode: ReaderTypographyMode;
};

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontSize: 19,
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
    fontSize: nearest(raw.fontSize, [17, 19, 21] as const, DEFAULT_READER_SETTINGS.fontSize),
    lineHeight: nearest(raw.lineHeight, [1.55, 1.72, 1.9] as const, DEFAULT_READER_SETTINGS.lineHeight),
    pageWidth: nearest(raw.pageWidth, [660, 760, 860] as const, DEFAULT_READER_SETTINGS.pageWidth),
    theme: option(raw.theme, ["paper", "sepia", "night"] as const, DEFAULT_READER_SETTINGS.theme),
    pencilMode: option(raw.pencilMode, ["page", "select"] as const, DEFAULT_READER_SETTINGS.pencilMode),
    textAlign: option(raw.textAlign, ["justify", "start"] as const, DEFAULT_READER_SETTINGS.textAlign),
    paragraphStyle: option(raw.paragraphStyle, ["book", "spaced"] as const, DEFAULT_READER_SETTINGS.paragraphStyle),
    typographyMode: option(raw.typographyMode, ["dawn", "publisher"] as const, DEFAULT_READER_SETTINGS.typographyMode),
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
