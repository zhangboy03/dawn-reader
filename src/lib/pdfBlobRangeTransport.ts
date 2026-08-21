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

/**
 * Gives PDF.js bounded slices of a local Blob instead of copying the complete
 * source into an ArrayBuffer before parsing can begin.
 */
export function createPdfBlobRangeTransport<T extends PdfDataRangeTransportLike>(
  BaseTransport: PdfDataRangeTransportConstructor<T>,
  blob: Blob,
  fileName: string,
): T {
  let aborted = false;

  class BlobRangeTransport extends BaseTransport {
    requestDataRange(begin: number, end: number) {
      if (aborted) return;
      void blob.slice(begin, end).arrayBuffer().then((buffer) => {
        if (!aborted) this.onDataRange(begin, new Uint8Array(buffer));
      }).catch(() => {
        if (!aborted) this.onDataRange(begin, null);
      });
    }

    abort() {
      aborted = true;
    }
  }

  return new BlobRangeTransport(blob.size, null, true, fileName);
}
