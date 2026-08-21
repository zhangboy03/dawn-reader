export const DAWN_YELLOW = "#ffed00" as const;
export const PDF_HIGHLIGHT_SCHEMA_VERSION = 2 as const;

export type PdfQuad = { x1: number; y1: number; x2: number; y2: number };

export type PdfHighlight = {
  id: string;
  pageIndex: number;
  text: string;
  quads: PdfQuad[];
  color: typeof DAWN_YELLOW;
  createdAt: string;
};

export type PdfHighlightRecovery = { discarded: number; migratedFrom: number | null };

export type PdfHighlightSidecar = {
  version: typeof PDF_HIGHLIGHT_SCHEMA_VERSION;
  bookId: string;
  highlights: PdfHighlight[];
  updatedAt: string;
  /** Runtime-only diagnostics. savePdfHighlightSidecar deliberately strips this field. */
  recovery?: PdfHighlightRecovery;
};

const PREFIX = "dawn-reader-pdf-highlights:";
const QUARANTINE_PREFIX = "dawn-reader-pdf-highlights-quarantine:";
const MAX_QUARANTINE_CHARS = 100_000;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

type ReadStorage = Pick<Storage, "getItem"> & Partial<Pick<Storage, "setItem" | "removeItem">>;
type WriteStorage = Pick<Storage, "setItem">;

export function normalizePdfQuad(value: unknown): PdfQuad | null {
  if (!value || typeof value !== "object") return null;
  const q = value as Partial<PdfQuad>;
  if (![q.x1, q.y1, q.x2, q.y2].every(finite)) return null;
  const x1 = Math.min(q.x1!, q.x2!);
  const x2 = Math.max(q.x1!, q.x2!);
  const y1 = Math.min(q.y1!, q.y2!);
  const y2 = Math.max(q.y1!, q.y2!);
  if (x2 - x1 <= 0 || y2 - y1 <= 0) return null;
  return { x1, y1, x2, y2 };
}

export function normalizePdfHighlight(value: unknown): PdfHighlight | null {
  if (!value || typeof value !== "object") return null;
  const h = value as Partial<PdfHighlight>;
  const quads = Array.isArray(h.quads)
    ? h.quads.map(normalizePdfQuad).filter((quad): quad is PdfQuad => Boolean(quad))
    : [];
  if (typeof h.id !== "string" || !h.id.trim()) return null;
  if (!Number.isInteger(h.pageIndex) || (h.pageIndex ?? -1) < 0) return null;
  if (typeof h.text !== "string" || !h.text.trim() || !quads.length) return null;
  return {
    id: h.id.trim().slice(0, 256),
    pageIndex: h.pageIndex!,
    text: h.text.trim().slice(0, 20_000),
    quads,
    color: DAWN_YELLOW,
    createdAt: typeof h.createdAt === "string" && Number.isFinite(Date.parse(h.createdAt))
      ? new Date(h.createdAt).toISOString()
      : new Date(0).toISOString(),
  };
}

function normalizedSidecar(value: unknown, expectedBookId?: string) {
  if (!value || typeof value !== "object") return null;
  const sidecar = value as { version?: unknown; bookId?: unknown; highlights?: unknown; updatedAt?: unknown };
  const sourceVersion = typeof sidecar.version === "number" ? sidecar.version : null;
  if (sourceVersion !== 1 && sourceVersion !== PDF_HIGHLIGHT_SCHEMA_VERSION) return null;
  if (typeof sidecar.bookId !== "string" || !sidecar.bookId) return null;
  if (expectedBookId && sidecar.bookId !== expectedBookId) return null;
  const rawHighlights = Array.isArray(sidecar.highlights) ? sidecar.highlights : [];
  const highlights = rawHighlights.map(normalizePdfHighlight).filter((highlight): highlight is PdfHighlight => Boolean(highlight));
  const recovery: PdfHighlightRecovery | undefined = sourceVersion !== PDF_HIGHLIGHT_SCHEMA_VERSION || highlights.length !== rawHighlights.length
    ? { discarded: rawHighlights.length - highlights.length, migratedFrom: sourceVersion }
    : undefined;
  return {
    sidecar: {
      version: PDF_HIGHLIGHT_SCHEMA_VERSION,
      bookId: sidecar.bookId,
      highlights,
      updatedAt: typeof sidecar.updatedAt === "string" && Number.isFinite(Date.parse(sidecar.updatedAt))
        ? new Date(sidecar.updatedAt).toISOString()
        : new Date(0).toISOString(),
      ...(recovery ? { recovery } : {}),
    } satisfies PdfHighlightSidecar,
    recovery,
  };
}

export function normalizePdfHighlightSidecar(value: unknown, expectedBookId?: string): PdfHighlightSidecar | null {
  if (typeof value === "string") {
    try { return normalizedSidecar(JSON.parse(value), expectedBookId)?.sidecar ?? null; } catch { return null; }
  }
  return normalizedSidecar(value, expectedBookId)?.sidecar ?? null;
}

export function pdfHighlightStorageKey(bookId: string) { return `${PREFIX}${bookId}`; }
export function pdfHighlightQuarantineStorageKey(bookId: string) { return `${QUARANTINE_PREFIX}${bookId}`; }

export function emptyPdfHighlightSidecar(bookId: string, recovery?: PdfHighlightRecovery): PdfHighlightSidecar {
  return {
    version: PDF_HIGHLIGHT_SCHEMA_VERSION,
    bookId,
    highlights: [],
    updatedAt: new Date(0).toISOString(),
    ...(recovery ? { recovery } : {}),
  };
}

function persistedSidecar(sidecar: PdfHighlightSidecar): Omit<PdfHighlightSidecar, "recovery"> {
  const { recovery: _recovery, ...persisted } = sidecar;
  return persisted;
}

function quarantineInvalidSidecar(bookId: string, raw: string, storage: ReadStorage, recovery: PdfHighlightRecovery) {
  try {
    storage.setItem?.(pdfHighlightQuarantineStorageKey(bookId), JSON.stringify({
      version: 1,
      bookId,
      quarantinedAt: new Date().toISOString(),
      recovery,
      raw: raw.slice(0, MAX_QUARANTINE_CHARS),
    }));
  } catch {
    // Recovery must never make the reader fail to open.
  }
}

export function loadPdfHighlightSidecar(bookId: string, storage: ReadStorage = localStorage) {
  const key = pdfHighlightStorageKey(bookId);
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
    if (!raw) return emptyPdfHighlightSidecar(bookId);
    const normalized = normalizedSidecar(JSON.parse(raw), bookId);
    if (!normalized) {
      const recovery = { discarded: 1, migratedFrom: null } satisfies PdfHighlightRecovery;
      quarantineInvalidSidecar(bookId, raw, storage, recovery);
      storage.removeItem?.(key);
      return emptyPdfHighlightSidecar(bookId, recovery);
    }
    const { sidecar, recovery } = normalized;
    if (recovery) {
      quarantineInvalidSidecar(bookId, raw, storage, recovery);
      storage.setItem?.(key, JSON.stringify(persistedSidecar(sidecar)));
    }
    return sidecar;
  } catch {
    const recovery = { discarded: raw ? 1 : 0, migratedFrom: null } satisfies PdfHighlightRecovery;
    if (raw) quarantineInvalidSidecar(bookId, raw, storage, recovery);
    storage.removeItem?.(key);
    return emptyPdfHighlightSidecar(bookId, recovery);
  }
}

export function savePdfHighlightSidecar(sidecar: PdfHighlightSidecar, storage: WriteStorage = localStorage) {
  const normalized = normalizePdfHighlightSidecar(sidecar, sidecar.bookId);
  if (!normalized) throw new Error("Invalid PDF highlight sidecar.");
  const next: PdfHighlightSidecar = { ...persistedSidecar(normalized), updatedAt: new Date().toISOString() };
  storage.setItem(pdfHighlightStorageKey(next.bookId), JSON.stringify(next));
  return next;
}

function sameQuad(left: PdfQuad, right: PdfQuad) {
  const tolerance = 0.01;
  return Math.abs(left.x1 - right.x1) <= tolerance
    && Math.abs(left.y1 - right.y1) <= tolerance
    && Math.abs(left.x2 - right.x2) <= tolerance
    && Math.abs(left.y2 - right.y2) <= tolerance;
}

function duplicateHighlight(left: PdfHighlight, right: PdfHighlight) {
  return left.pageIndex === right.pageIndex
    && left.text === right.text
    && left.quads.length === right.quads.length
    && left.quads.every((quad, index) => sameQuad(quad, right.quads[index]));
}

export function addPdfHighlight(bookId: string, highlight: PdfHighlight, storage: ReadStorage & WriteStorage = localStorage) {
  const normalized = normalizePdfHighlight(highlight);
  if (!normalized) throw new Error("Invalid PDF highlight geometry.");
  const current = loadPdfHighlightSidecar(bookId, storage);
  if (current.highlights.some((existing) => duplicateHighlight(existing, normalized))) {
    return savePdfHighlightSidecar(current, storage);
  }
  return savePdfHighlightSidecar({ ...current, highlights: [...current.highlights, normalized] }, storage);
}

export function removePdfHighlight(bookId: string, highlightId: string, storage: ReadStorage & WriteStorage = localStorage) {
  const current = loadPdfHighlightSidecar(bookId, storage);
  return savePdfHighlightSidecar({ ...current, highlights: current.highlights.filter((highlight) => highlight.id !== highlightId) }, storage);
}

export function deletePdfHighlightSidecar(bookId: string, storage: Pick<Storage, "removeItem"> = localStorage) {
  storage.removeItem(pdfHighlightStorageKey(bookId));
  storage.removeItem(pdfHighlightQuarantineStorageKey(bookId));
}

export type PdfViewportLike = {
  convertToPdfPoint(x: number, y: number): [number, number];
  convertToViewportPoint(x: number, y: number): [number, number];
};

function finitePoint(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length >= 2 && finite(value[0]) && finite(value[1]);
}

export function clientRectToPdfQuad(
  rect: Pick<DOMRect, "left" | "top" | "right" | "bottom">,
  pageRect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  viewport: Pick<PdfViewportLike, "convertToPdfPoint"> & { width?: number; height?: number },
): PdfQuad | null {
  if (!pageRect.width || !pageRect.height) return null;
  try {
    const scaleX = finite(viewport.width) ? viewport.width! / pageRect.width : 1;
    const scaleY = finite(viewport.height) ? viewport.height! / pageRect.height : 1;
    const first = viewport.convertToPdfPoint((rect.left - pageRect.left) * scaleX, (rect.top - pageRect.top) * scaleY);
    const second = viewport.convertToPdfPoint((rect.right - pageRect.left) * scaleX, (rect.bottom - pageRect.top) * scaleY);
    if (!finitePoint(first) || !finitePoint(second)) return null;
    return normalizePdfQuad({ x1: first[0], y1: first[1], x2: second[0], y2: second[1] });
  } catch {
    return null;
  }
}

export function pdfQuadToViewportRect(quad: PdfQuad, viewport: Pick<PdfViewportLike, "convertToViewportPoint">) {
  const normalized = normalizePdfQuad(quad);
  if (!normalized) return null;
  try {
    // PDF.js 6 removed convertToViewportRectangle. Point conversion honors the
    // active CropBox, scale and page rotation; normalize in viewport space.
    const first = viewport.convertToViewportPoint(normalized.x1, normalized.y1);
    const second = viewport.convertToViewportPoint(normalized.x2, normalized.y2);
    if (!finitePoint(first) || !finitePoint(second)) return null;
    const left = Math.min(first[0], second[0]);
    const top = Math.min(first[1], second[1]);
    const width = Math.abs(second[0] - first[0]);
    const height = Math.abs(second[1] - first[1]);
    if (!finite(left) || !finite(top) || !finite(width) || !finite(height) || width <= 0 || height <= 0) return null;
    return { left, top, width, height };
  } catch {
    return null;
  }
}
