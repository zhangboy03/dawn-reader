import * as pdfjsLib from "pdfjs-dist/build/pdf.mjs";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { paperMetadataText, paperYearFromMetadata } from "./paperMetadata";

export type PdfPresentation = {
  title: string | null;
  author: string | null;
  year: string | null;
  pageCount: number | null;
  cover: Blob | null;
};

const THUMBNAIL_WIDTH = 480;

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((webp) => {
      if (webp) {
        resolve(webp);
        return;
      }
      canvas.toBlob(resolve, "image/jpeg", 0.88);
    }, "image/webp", 0.88);
  });
}

export async function extractPdfPresentation(blob: Blob): Promise<PdfPresentation> {
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    wasmUrl: "/pdfjs/wasm/",
    isEvalSupported: false,
    enableXfa: false,
    useSystemFonts: false,
    stopAtErrors: false,
  });
  let pdfDocument: Awaited<typeof loadingTask.promise> | null = null;
  try {
    pdfDocument = await loadingTask.promise;
    const rawMetadata = await pdfDocument.getMetadata().catch(() => null) as {
      info?: Record<string, unknown>;
      metadata?: { get?: (name: string) => unknown } | null;
    } | null;
    const info = rawMetadata?.info ?? {};
    const xmp = rawMetadata?.metadata;
    const title = paperMetadataText(info.Title) ?? paperMetadataText(xmp?.get?.("dc:title"));
    const author = paperMetadataText(info.Author) ?? paperMetadataText(xmp?.get?.("dc:creator"));
    const year = paperYearFromMetadata(
      info.CreationDate,
      info.ModDate,
      info.Subject,
      xmp?.get?.("dc:date"),
    );

    const page = await pdfDocument.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = THUMBNAIL_WIDTH / Math.max(1, baseViewport.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas is unavailable for the PDF thumbnail.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const cover = await canvasBlob(canvas);
    canvas.width = 1;
    canvas.height = 1;
    return {
      title,
      author,
      year,
      pageCount: pdfDocument.numPages,
      cover,
    };
  } finally {
    if (typeof pdfDocument?.destroy === "function") {
      await pdfDocument.destroy().catch(() => undefined);
    } else if (typeof loadingTask.destroy === "function") {
      await loadingTask.destroy().catch(() => undefined);
    }
  }
}
