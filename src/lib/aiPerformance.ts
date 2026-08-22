import { accountDatabaseName } from "./clientAccountContext";
import type { SelectionKind } from "./selectionKind";

const DB_NAME = "dawn-reader-ai-performance";
const DB_VERSION = 1;
const EVENTS_STORE = "events";
const CHANGE_EVENT = "dawn-reader-ai-performance-change";
const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

export type AiPerformancePeriod = "morning" | "afternoon" | "evening" | "overnight";
export type AiSelectionLength = "short" | "medium" | "long";

export type AiPerformanceEvent = {
  attempts: number;
  cfColo: string | null;
  clientTotalMs: number;
  errorClass: string | null;
  id: string;
  inputTokens: number | null;
  mode: "english";
  model: string | null;
  outputTokens: number | null;
  platform: "web";
  provider: string | null;
  providerMs: number | null;
  schemaVersion: 1;
  selectionKind: SelectionKind;
  selectionLength: AiSelectionLength;
  startedAt: string;
  success: boolean;
  surface: "pdf";
  workerMs: number | null;
};

export type AiPerformanceBucketSummary = {
  count: number;
  p50Ms: number | null;
  p95Ms: number | null;
};

export type AiPerformanceSummary = {
  byPeriod: Record<AiPerformancePeriod, AiPerformanceBucketSummary>;
  colos: Array<{ colo: string; count: number }>;
  count: number;
  p50Ms: number | null;
  p95Ms: number | null;
  providerP50Ms: number | null;
  successRate: number | null;
  workerP50Ms: number | null;
};

function openDatabase() {
  const databaseName = accountDatabaseName(DB_NAME, 1);
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(EVENTS_STORE)) {
        const store = database.createObjectStore(EVENTS_STORE, { keyPath: "id" });
        store.createIndex("startedAt", "startedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionFinished(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("AI performance transaction aborted."));
  });
}

export function subscribeAiPerformance(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}

export async function saveAiPerformanceEvent(event: AiPerformanceEvent) {
  const database = await openDatabase();
  const transaction = database.transaction(EVENTS_STORE, "readwrite");
  const store = transaction.objectStore(EVENTS_STORE);
  store.put(event);
  const cutoff = new Date(Date.now() - RETENTION_MS).toISOString();
  const cursorRequest = store.index("startedAt").openCursor(IDBKeyRange.upperBound(cutoff, true));
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    cursor.delete();
    cursor.continue();
  };
  await transactionFinished(transaction);
  database.close();
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export async function listAiPerformanceEvents(since?: Date) {
  const database = await openDatabase();
  const transaction = database.transaction(EVENTS_STORE, "readonly");
  const index = transaction.objectStore(EVENTS_STORE).index("startedAt");
  const request = since
    ? index.getAll(IDBKeyRange.lowerBound(since.toISOString()))
    : index.getAll();
  const events = await new Promise<AiPerformanceEvent[]>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as AiPerformanceEvent[]);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return events.sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

export function selectionLengthBucket(text: string): AiSelectionLength {
  const length = text.replace(/\s+/g, " ").trim().length;
  if (length <= 40) return "short";
  if (length <= 240) return "medium";
  return "long";
}

export function performancePeriod(startedAt: string): AiPerformancePeriod {
  const hour = new Date(Date.parse(startedAt) + 8 * 60 * 60 * 1000).getUTCHours();
  if (hour >= 7 && hour < 12) return "morning";
  if (hour >= 12 && hour < 19) return "afternoon";
  if (hour >= 19) return "evening";
  return "overnight";
}

export function percentile(values: number[], quantile: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(quantile * sorted.length) - 1));
  return sorted[index];
}

function bucketSummary(events: AiPerformanceEvent[]): AiPerformanceBucketSummary {
  const values = events.map((event) => event.clientTotalMs);
  return { count: events.length, p50Ms: percentile(values, 0.5), p95Ms: percentile(values, 0.95) };
}

export function summarizeAiPerformance(events: AiPerformanceEvent[], now = new Date()): AiPerformanceSummary {
  const cutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const recent = events.filter((event) => Date.parse(event.startedAt) >= cutoff);
  const byPeriod = Object.fromEntries(
    (["morning", "afternoon", "evening", "overnight"] as const).map((period) => [
      period,
      bucketSummary(recent.filter((event) => performancePeriod(event.startedAt) === period)),
    ]),
  ) as Record<AiPerformancePeriod, AiPerformanceBucketSummary>;
  const coloCounts = new Map<string, number>();
  for (const event of recent) {
    if (event.cfColo) coloCounts.set(event.cfColo, (coloCounts.get(event.cfColo) ?? 0) + 1);
  }
  return {
    byPeriod,
    colos: [...coloCounts].map(([colo, count]) => ({ colo, count })).sort((left, right) => right.count - left.count),
    count: recent.length,
    p50Ms: percentile(recent.map((event) => event.clientTotalMs), 0.5),
    p95Ms: percentile(recent.map((event) => event.clientTotalMs), 0.95),
    providerP50Ms: percentile(recent.flatMap((event) => event.providerMs == null ? [] : [event.providerMs]), 0.5),
    successRate: recent.length ? recent.filter((event) => event.success).length / recent.length : null,
    workerP50Ms: percentile(recent.flatMap((event) => event.workerMs == null ? [] : [event.workerMs]), 0.5),
  };
}
