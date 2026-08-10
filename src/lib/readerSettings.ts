export type ReaderTheme = "paper" | "sepia" | "night";
export type PencilMode = "page" | "select";

export type ReaderSettings = {
  fontSize: 17 | 19 | 21;
  lineHeight: 1.55 | 1.72 | 1.9;
  pageWidth: 660 | 760 | 860;
  theme: ReaderTheme;
  pencilMode: PencilMode;
};

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontSize: 19,
  lineHeight: 1.72,
  pageWidth: 760,
  theme: "paper",
  pencilMode: "page",
};

const SETTINGS_KEY = "dawn-reader-settings";

export function loadReaderSettings(): ReaderSettings {
  try {
    return { ...DEFAULT_READER_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") };
  } catch {
    return DEFAULT_READER_SETTINGS;
  }
}

export function saveReaderSettings(settings: ReaderSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
