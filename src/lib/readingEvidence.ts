import { selectionKind, type SelectionKind } from "./selectionKind";
import { accountDatabaseName } from "./clientAccountContext";

const LEGACY_DB_NAME = "dawn-reader-evidence";
const DB_VERSION = 1;
const RECORDS_STORE = "lookup-records";
const TIME_STORE = "reading-time";
const CHANGE_EVENT = "dawn-reader-evidence-change";

export type ReadingEvidenceKind = SelectionKind;

export type EvidenceAnchor = {
  cfi: string | null;
  href: string | null;
  percentage: number | null;
};

export type EvidenceExplanation = {
  id: string;
  mode: "english" | "chinese" | "chat";
  text: string;
  question?: string;
  provider?: string;
  presentedAt: string;
};

export type ReadingEvidenceRecord = {
  id: string;
  bookId: string | null;
  editionId: string;
  bookTitle: string;
  kind: ReadingEvidenceKind;
  selectedText: string;
  sentenceText: string;
  contextBefore: string;
  contextAfter: string;
  anchor: EvidenceAnchor;
  explanations: EvidenceExplanation[];
  createdAt: string;
  updatedAt: string;
};

export type ReadingEvidenceDraft = Omit<ReadingEvidenceRecord, "explanations" | "createdAt" | "updatedAt"> & {
  explanation: EvidenceExplanation;
};

export type ReadingTimeSlice = {
  id: string;
  bookId: string | null;
  bookTitle: string;
  startedAt: string;
  endedAt: string;
  activeMs: number;
};

export type ReadingTimeSummary = {
  todayMs: number;
  weekMs: number;
};

function openEvidenceDatabaseByName(databaseName: string) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RECORDS_STORE)) {
        const records = database.createObjectStore(RECORDS_STORE, { keyPath: "id" });
        records.createIndex("updatedAt", "updatedAt");
        records.createIndex("bookId", "bookId");
      }
      if (!database.objectStoreNames.contains(TIME_STORE)) {
        const time = database.createObjectStore(TIME_STORE, { keyPath: "id" });
        time.createIndex("endedAt", "endedAt");
        time.createIndex("bookId", "bookId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openEvidenceDatabase() {
  return openEvidenceDatabaseByName(accountDatabaseName(LEGACY_DB_NAME, 2));
}

async function databaseExists(databaseName: string) {
  if (typeof indexedDB.databases !== "function") return false;
  return (await indexedDB.databases()).some((database) => database.name === databaseName);
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionFinished(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("Evidence transaction aborted."));
  });
}

function announceEvidenceChange() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeReadingEvidence(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function sentenceAroundSelection(before: string, selected: string, after: string, limit = 520) {
  const normalizedBefore = normalizeWhitespace(before);
  const normalizedSelected = normalizeWhitespace(selected);
  const normalizedAfter = normalizeWhitespace(after);
  if (!normalizedSelected) return "";

  const boundary = /[.!?。！？]\s*/g;
  let beforeStart = 0;
  for (const match of normalizedBefore.matchAll(boundary)) {
    beforeStart = (match.index ?? 0) + match[0].length;
  }
  const afterMatch = boundary.exec(normalizedAfter);
  const afterEnd = afterMatch ? (afterMatch.index ?? 0) + afterMatch[0].length : normalizedAfter.length;
  const sentence = normalizeWhitespace([
    normalizedBefore.slice(beforeStart),
    normalizedSelected,
    normalizedAfter.slice(0, afterEnd),
  ].filter(Boolean).join(" "));
  if (sentence.length <= limit) return sentence;
  return `${sentence.slice(0, limit - 1).trimEnd()}…`;
}

export function mergeEvidenceRecord(existing: ReadingEvidenceRecord | undefined, draft: ReadingEvidenceDraft) {
  const explanationExists = existing?.explanations.some((item) => item.id === draft.explanation.id);
  const explanations = explanationExists
    ? existing!.explanations
    : [...(existing?.explanations ?? []), draft.explanation];
  return {
    id: draft.id,
    bookId: draft.bookId,
    editionId: draft.editionId,
    bookTitle: draft.bookTitle,
    kind: draft.kind,
    selectedText: draft.selectedText,
    sentenceText: draft.sentenceText,
    contextBefore: draft.contextBefore,
    contextAfter: draft.contextAfter,
    anchor: draft.anchor,
    explanations,
    createdAt: existing?.createdAt ?? draft.explanation.presentedAt,
    updatedAt: draft.explanation.presentedAt,
  } satisfies ReadingEvidenceRecord;
}

export function readingEvidenceKind(text: string) {
  return selectionKind(text);
}

export async function saveReadingEvidence(draft: ReadingEvidenceDraft) {
  const database = await openEvidenceDatabase();
  const transaction = database.transaction(RECORDS_STORE, "readwrite");
  const store = transaction.objectStore(RECORDS_STORE);
  const existing = await requestResult(store.get(draft.id)) as ReadingEvidenceRecord | undefined;
  const record = mergeEvidenceRecord(existing, draft);
  store.put(record);
  await transactionFinished(transaction);
  database.close();
  announceEvidenceChange();
  return record;
}

export async function listReadingEvidence() {
  const database = await openEvidenceDatabase();
  const transaction = database.transaction(RECORDS_STORE, "readonly");
  const records = await requestResult(transaction.objectStore(RECORDS_STORE).getAll()) as ReadingEvidenceRecord[];
  database.close();
  return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function legacyEvidenceRecords() {
  if (!await databaseExists(LEGACY_DB_NAME)) {
    return { records: [] as ReadingEvidenceRecord[], slices: [] as ReadingTimeSlice[] };
  }
  const database = await openEvidenceDatabaseByName(LEGACY_DB_NAME);
  if (!database.objectStoreNames.contains(RECORDS_STORE)) {
    database.close();
    return { records: [] as ReadingEvidenceRecord[], slices: [] as ReadingTimeSlice[] };
  }
  const stores = database.objectStoreNames.contains(TIME_STORE)
    ? [RECORDS_STORE, TIME_STORE]
    : [RECORDS_STORE];
  const transaction = database.transaction(stores, "readonly");
  const records = await requestResult(transaction.objectStore(RECORDS_STORE).getAll()) as ReadingEvidenceRecord[];
  const slices = database.objectStoreNames.contains(TIME_STORE)
    ? await requestResult(transaction.objectStore(TIME_STORE).getAll()) as ReadingTimeSlice[]
    : [];
  database.close();
  return { records, slices };
}

export async function legacyReadingEvidenceCount() {
  const legacy = await legacyEvidenceRecords();
  return legacy.records.length + legacy.slices.length;
}

export async function claimLegacyReadingEvidence() {
  const legacy = await legacyEvidenceRecords();
  if (!legacy.records.length && !legacy.slices.length) return 0;
  const database = await openEvidenceDatabase();
  const transaction = database.transaction([RECORDS_STORE, TIME_STORE], "readwrite");
  const finished = transactionFinished(transaction);
  for (const record of legacy.records) transaction.objectStore(RECORDS_STORE).put(record);
  for (const slice of legacy.slices) transaction.objectStore(TIME_STORE).put(slice);
  await finished;
  database.close();
  return legacy.records.length + legacy.slices.length;
}

export async function deleteReadingEvidence(id: string) {
  const database = await openEvidenceDatabase();
  const transaction = database.transaction(RECORDS_STORE, "readwrite");
  transaction.objectStore(RECORDS_STORE).delete(id);
  await transactionFinished(transaction);
  database.close();
  announceEvidenceChange();
}

export async function saveReadingTimeSlice(slice: ReadingTimeSlice) {
  if (!Number.isFinite(slice.activeMs) || slice.activeMs <= 0) return;
  const database = await openEvidenceDatabase();
  const transaction = database.transaction(TIME_STORE, "readwrite");
  transaction.objectStore(TIME_STORE).put(slice);
  await transactionFinished(transaction);
  database.close();
  announceEvidenceChange();
}

export async function listReadingTimeSlices() {
  const database = await openEvidenceDatabase();
  const transaction = database.transaction(TIME_STORE, "readonly");
  const slices = await requestResult(transaction.objectStore(TIME_STORE).getAll()) as ReadingTimeSlice[];
  database.close();
  return slices.sort((a, b) => b.endedAt.localeCompare(a.endedAt));
}

export function summarizeReadingTime(slices: ReadingTimeSlice[], now = new Date()): ReadingTimeSummary {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6);
  let todayMs = 0;
  let weekMs = 0;
  for (const slice of slices) {
    const endedAt = new Date(slice.endedAt);
    if (!Number.isFinite(endedAt.getTime())) continue;
    if (endedAt >= weekStart && endedAt <= now) weekMs += slice.activeMs;
    if (endedAt >= todayStart && endedAt <= now) todayMs += slice.activeMs;
  }
  return { todayMs, weekMs };
}

type ReadingActivityRecorderOptions = {
  bookId: string | null;
  bookTitle: string;
  onSlice: (slice: ReadingTimeSlice) => void | Promise<void>;
  nowMonotonic?: () => number;
  nowWall?: () => Date;
  activeCapMs?: number;
};

export class ReadingActivityRecorder {
  private readonly bookId: string | null;
  private readonly bookTitle: string;
  private readonly onSlice: ReadingActivityRecorderOptions["onSlice"];
  private readonly nowMonotonic: () => number;
  private readonly nowWall: () => Date;
  private readonly activeCapMs: number;
  private readonly seenEventIds = new Set<string>();
  private eligible = false;
  private activeUntil: number | null = null;
  private creditedThrough: number | null = null;

  constructor(options: ReadingActivityRecorderOptions) {
    this.bookId = options.bookId;
    this.bookTitle = options.bookTitle;
    this.onSlice = options.onSlice;
    this.nowMonotonic = options.nowMonotonic ?? (() => performance.now());
    this.nowWall = options.nowWall ?? (() => new Date());
    this.activeCapMs = options.activeCapMs ?? 60_000;
  }

  setEligible(eligible: boolean) {
    if (this.eligible === eligible) return;
    if (!eligible) this.flush();
    this.eligible = eligible;
    if (!eligible) {
      this.activeUntil = null;
      this.creditedThrough = null;
    }
  }

  signal(eventId: string) {
    if (!this.eligible || this.seenEventIds.has(eventId)) return false;
    this.seenEventIds.add(eventId);
    this.flush();
    const now = this.nowMonotonic();
    if (this.activeUntil === null || now > this.activeUntil || this.creditedThrough === null) {
      this.creditedThrough = now;
    }
    this.activeUntil = now + this.activeCapMs;
    return true;
  }

  flush() {
    if (!this.eligible || this.activeUntil === null || this.creditedThrough === null) return 0;
    const now = this.nowMonotonic();
    const end = Math.min(now, this.activeUntil);
    const activeMs = Math.max(0, end - this.creditedThrough);
    if (activeMs <= 0) return 0;
    const endedAt = this.nowWall();
    const startedAt = new Date(endedAt.getTime() - activeMs);
    this.creditedThrough = end;
    void this.onSlice({
      id: crypto.randomUUID(),
      bookId: this.bookId,
      bookTitle: this.bookTitle,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      activeMs,
    });
    return activeMs;
  }

  close() {
    const activeMs = this.flush();
    this.eligible = false;
    this.activeUntil = null;
    this.creditedThrough = null;
    return activeMs;
  }
}
