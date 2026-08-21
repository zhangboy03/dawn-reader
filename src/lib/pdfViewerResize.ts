import type { PdfFitMode } from "./pdfLocator";

export type PdfViewerLayoutTarget = {
  currentScaleValue: string | number;
  update?: () => void;
};

type PdfViewerContainerSize = {
  clientWidth: number;
  clientHeight: number;
};

type AnimationFrameScheduler = {
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (handle: number) => void;
};

export type PdfViewerResizeController = {
  notify: () => void;
  dispose: () => void;
};

export function pdfSemanticScaleValue(fit: PdfFitMode): "page-width" | "page-fit" | null {
  if (fit === "width") return "page-width";
  if (fit === "page") return "page-fit";
  return null;
}

export function refreshPdfViewerLayout(viewer: PdfViewerLayoutTarget, fit: PdfFitMode) {
  const semanticScale = pdfSemanticScaleValue(fit);
  if (semanticScale) viewer.currentScaleValue = semanticScale;
  viewer.update?.();
}

export function createPdfViewerResizeController({
  getContainer,
  getViewer,
  getFit,
  requestFrame = (callback) => window.requestAnimationFrame(callback),
  cancelFrame = (handle) => window.cancelAnimationFrame(handle),
}: {
  getContainer: () => PdfViewerContainerSize | null;
  getViewer: () => PdfViewerLayoutTarget | null;
  getFit: () => PdfFitMode;
} & Partial<AnimationFrameScheduler>): PdfViewerResizeController {
  let frame: number | null = null;
  let disposed = false;
  let lastWidth = -1;
  let lastHeight = -1;
  let lastAppliedWidth = -1;
  let lastAppliedHeight = -1;
  let stableMeasurements = 0;

  const measure: FrameRequestCallback = () => {
    frame = null;
    if (disposed) return;
    const container = getContainer();
    if (!container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width <= 0 || height <= 0) return;

    if (width === lastWidth && height === lastHeight) {
      stableMeasurements += 1;
    } else {
      lastWidth = width;
      lastHeight = height;
      stableMeasurements = 0;
    }

    // Apply only after consecutive equal measurements. ResizeObserver or the
    // transition-end signal will notify again if the container advances later.
    if (stableMeasurements < 1) {
      frame = requestFrame(measure);
      return;
    }

    if (width === lastAppliedWidth && height === lastAppliedHeight) return;
    const viewer = getViewer();
    if (!viewer) return;
    refreshPdfViewerLayout(viewer, getFit());
    lastAppliedWidth = width;
    lastAppliedHeight = height;
  };

  return {
    notify() {
      if (disposed || frame !== null) return;
      frame = requestFrame(measure);
    },
    dispose() {
      disposed = true;
      if (frame !== null) cancelFrame(frame);
      frame = null;
    },
  };
}
