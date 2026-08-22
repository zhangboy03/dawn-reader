export type PdfRenderedCanvas = {
  width?: number;
  height?: number;
} | null | undefined;

export function isSuccessfulTargetPageRender({
  generation,
  currentGeneration,
  targetPage,
  pageNumber,
  error,
  canvas,
  cssTransform,
  isDetailView,
  canvasAttached,
  canvasVisible,
  pageAttached,
  pageVisible,
  layoutCurrent,
}: {
  generation: number;
  currentGeneration: number;
  targetPage: number | null;
  pageNumber: number | null;
  error: unknown;
  canvas: PdfRenderedCanvas;
  cssTransform: boolean;
  isDetailView: boolean;
  canvasAttached: boolean;
  canvasVisible: boolean;
  pageAttached: boolean;
  pageVisible: boolean;
  layoutCurrent: boolean;
}) {
  return generation === currentGeneration
    && targetPage !== null
    && pageNumber === targetPage
    && !error
    && Number(canvas?.width) > 0
    && Number(canvas?.height) > 0
    && !cssTransform
    && !isDetailView
    && canvasAttached
    && canvasVisible
    && pageAttached
    && pageVisible
    && layoutCurrent;
}
