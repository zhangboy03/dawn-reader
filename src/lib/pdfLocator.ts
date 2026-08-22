import { readerLocalStorage } from "./clientAccountContext";

export const PDF_LOCATOR_VERSION = 1 as const;
export type PdfFitMode = "width" | "page" | "custom";

export type PdfLocator = {
  type: "pdf";
  version: typeof PDF_LOCATOR_VERSION;
  pageIndex: number;
  offset: number;
  fit: PdfFitMode;
  scale: number | null;
  updatedAt: string;
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function normalizePdfLocator(value: unknown): PdfLocator | null {
  if (typeof value === "string") {
    try { return normalizePdfLocator(JSON.parse(value)); } catch { return null; }
  }
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PdfLocator>;
  if (candidate.type !== "pdf" || candidate.version !== PDF_LOCATOR_VERSION) return null;
  if (!Number.isInteger(candidate.pageIndex) || (candidate.pageIndex ?? -1) < 0) return null;
  const fit = candidate.fit === "width" || candidate.fit === "page" || candidate.fit === "custom"
    ? candidate.fit
    : "width";
  const scale = finite(candidate.scale) && candidate.scale >= 0.5 && candidate.scale <= 4
    ? candidate.scale
    : null;
  return {
    type: "pdf",
    version: PDF_LOCATOR_VERSION,
    pageIndex: candidate.pageIndex!,
    offset: finite(candidate.offset) ? Math.max(0, Math.min(1, candidate.offset)) : 0,
    fit,
    scale: fit === "custom" ? scale : null,
    updatedAt: typeof candidate.updatedAt === "string" && Number.isFinite(Date.parse(candidate.updatedAt))
      ? candidate.updatedAt
      : new Date(0).toISOString(),
  };
}

export function serializePdfLocator(locator: PdfLocator) {
  const normalized = normalizePdfLocator(locator);
  if (!normalized) throw new Error("Invalid PDF locator.");
  return JSON.stringify(normalized);
}

export function pdfLocatorStorageKey(bookId: string) {
  return `dawn-reader-progress:${bookId}`;
}

export function loadPdfLocator(bookId: string, storage: Pick<Storage, "getItem"> = readerLocalStorage()) {
  try {
    return normalizePdfLocator(storage.getItem(pdfLocatorStorageKey(bookId)));
  } catch {
    return null;
  }
}

export function savePdfLocator(bookId: string, locator: PdfLocator, storage: Pick<Storage, "setItem"> = readerLocalStorage()) {
  storage.setItem(pdfLocatorStorageKey(bookId), serializePdfLocator(locator));
  return locator;
}

export function deletePdfLocator(bookId: string, storage: Pick<Storage, "removeItem"> = readerLocalStorage()) {
  storage.removeItem(pdfLocatorStorageKey(bookId));
}
