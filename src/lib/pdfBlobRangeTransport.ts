type PdfDataRangeTransportLike = {
  onDataRange(begin: number, chunk: Uint8Array | null): void;
};

type PdfDataRangeTransportConstructor<T extends PdfDataRangeTransportLike> = new (
  length: number,
  initialData: Uint8Array | null,
  progressiveDone?: boolean,
  contentDispositionFilename?: string,
) => T;

export const LOCAL_PDF_RANGE_CHUNK_BYTES = 256 * 1024;
export const LOCAL_PDF_MAX_CONCURRENT_RANGES = 4;

export type PdfBlobRangeTransport<T> = T & {
  requestDataRange(begin: number, end: number): void;
  abort(): void;
};

/**
 * Gives PDF.js bounded slices of a local Blob instead of copying the complete
 * source into an ArrayBuffer before parsing can begin.
 */
export function createPdfBlobRangeTransport<T extends PdfDataRangeTransportLike>(
  BaseTransport: PdfDataRangeTransportConstructor<T>,
  blob: Blob,
  fileName: string,
): PdfBlobRangeTransport<T> {
  let aborted = false;
  let active = 0;
  const pending: Array<{ begin: number; end: number }> = [];

  class BlobRangeTransport extends (BaseTransport as PdfDataRangeTransportConstructor<PdfDataRangeTransportLike>) {
    private pump() {
      while (!aborted && active < LOCAL_PDF_MAX_CONCURRENT_RANGES && pending.length > 0) {
        const request = pending.shift()!;
        active += 1;
        void blob.slice(request.begin, request.end).arrayBuffer().then((buffer) => {
          if (aborted) return;
          const chunk = buffer.byteLength === request.end - request.begin ? new Uint8Array(buffer) : null;
          this.onDataRange(request.begin, chunk);
        }).catch(() => {
          if (!aborted) this.onDataRange(request.begin, null);
        }).finally(() => {
          active -= 1;
          this.pump();
        });
      }
    }

    requestDataRange(begin: number, end: number) {
      if (aborted) return;
      if (!Number.isInteger(begin) || !Number.isInteger(end) || begin < 0 || end <= begin || end > blob.size) {
        const safeBegin = Number.isFinite(begin) ? Math.max(0, Math.trunc(begin)) : 0;
        queueMicrotask(() => { if (!aborted) this.onDataRange(safeBegin, null); });
        return;
      }
      pending.push({ begin, end });
      this.pump();
    }

    abort() {
      aborted = true;
      pending.length = 0;
    }
  }

  return new BlobRangeTransport(blob.size, null, true, fileName) as PdfBlobRangeTransport<T>;
}
