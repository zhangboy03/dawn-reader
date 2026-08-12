import type { ReaderPreset } from "./lextale";

export type ReaderProfile = { score: number | null; band: string; preset: ReaderPreset };

const PROFILE_KEY = "dawn-reader-profile";
const NOTES_KEY = "dawn-reader-notes";

export function loadProfile(): ReaderProfile | null {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "null"); } catch { return null; }
}

export function saveProfile(profile: ReaderProfile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function addReadingNote(kind: "known" | "difficult", text: string) {
  const notes = loadReadingNotes();
  notes.unshift({ kind, text, at: new Date().toISOString() });
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes.slice(0, 200)));
}

export function loadReadingNotes(): Array<{ kind: "known" | "difficult"; text: string; at: string }> {
  try { return JSON.parse(localStorage.getItem(NOTES_KEY) ?? "[]"); } catch { return []; }
}
