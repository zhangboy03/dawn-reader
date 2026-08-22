import { claimLegacyStoredBooks, legacyStoredBookCount } from "./bookStore";
import { claimLegacyReadingEvidence, legacyReadingEvidenceCount } from "./readingEvidence";
import { readerLocalStorage } from "./clientAccountContext";

const LEGACY_DECISION_KEY = "legacy-local-data-decision";

export type LegacyLocalDataSummary = {
  books: number;
  evidence: number;
  localStorageKeys: number;
};

function legacyLocalStorageKeys(storage: Storage) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith("dawn-reader-")) keys.push(key);
  }
  return keys;
}

export function legacyLocalDataDecision(storage: Storage = localStorage) {
  return readerLocalStorage(storage).getItem(LEGACY_DECISION_KEY);
}

export function leaveLegacyLocalDataQuarantined(storage: Storage = localStorage) {
  readerLocalStorage(storage).setItem(LEGACY_DECISION_KEY, "quarantined");
}

export async function inspectLegacyLocalData(storage: Storage = localStorage): Promise<LegacyLocalDataSummary> {
  const [books, evidence] = await Promise.all([
    legacyStoredBookCount(),
    legacyReadingEvidenceCount(),
  ]);
  return { books, evidence, localStorageKeys: legacyLocalStorageKeys(storage).length };
}

export function claimLegacyLocalStorage(storage: Storage) {
  const destination = readerLocalStorage(storage);
  let copied = 0;
  for (const key of legacyLocalStorageKeys(storage)) {
    const value = storage.getItem(key);
    if (value === null || destination.getItem(key) !== null) continue;
    destination.setItem(key, value);
    copied += 1;
  }
  return copied;
}

export async function claimLegacyLocalData(storage: Storage = localStorage) {
  const [books, evidence] = await Promise.all([
    claimLegacyStoredBooks(),
    claimLegacyReadingEvidence(),
  ]);
  const localStorageKeys = claimLegacyLocalStorage(storage);
  readerLocalStorage(storage).setItem(LEGACY_DECISION_KEY, "claimed");
  return { books, evidence, localStorageKeys } satisfies LegacyLocalDataSummary;
}
