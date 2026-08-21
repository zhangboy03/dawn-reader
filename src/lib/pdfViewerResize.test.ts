import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createPdfViewerResizeController,
  pdfSemanticScaleValue,
  type PdfViewerLayoutTarget,
} from "./pdfViewerResize";
import type { PdfFitMode } from "./pdfLocator";

function frameQueue() {
  let nextHandle = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  return {
    requestFrame(callback: FrameRequestCallback) {
      const handle = nextHandle++;
      callbacks.set(handle, callback);
      return handle;
    },
    cancelFrame(handle: number) {
      callbacks.delete(handle);
    },
    flush() {
      const pending = [...callbacks.values()];
      callbacks.clear();
      pending.forEach((callback) => callback(0));
    },
    get size() {
      return callbacks.size;
    },
  };
}

function viewerHarness() {
  const assignments: Array<string | number> = [];
  const update = vi.fn();
  const viewer: PdfViewerLayoutTarget = {
    get currentScaleValue() {
      return assignments.at(-1) ?? 1;
    },
    set currentScaleValue(value) {
      assignments.push(value);
    },
    update,
  };
  return { viewer, assignments, update };
}

describe("PDF viewer resize synchronization", () => {
  it("reapplies fit width only after the sidebar transition reaches its final container width", () => {
    const frames = frameQueue();
    const container = { clientWidth: 1280, clientHeight: 900 };
    const fit = { value: "width" as PdfFitMode };
    const { viewer, assignments, update } = viewerHarness();
    const controller = createPdfViewerResizeController({
      getContainer: () => container,
      getViewer: () => viewer,
      getFit: () => fit.value,
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
    });

    controller.notify();
    frames.flush();
    container.clientWidth = 1148;
    frames.flush();
    container.clientWidth = 988;
    frames.flush();
    expect(assignments).toEqual([]);
    frames.flush();

    expect(assignments).toEqual(["page-width"]);
    expect(update).toHaveBeenCalledTimes(1);

    container.clientWidth = 1100;
    controller.notify();
    frames.flush();
    container.clientWidth = 1280;
    frames.flush();
    frames.flush();

    expect(assignments).toEqual(["page-width", "page-width"]);
    expect(update).toHaveBeenCalledTimes(2);

    for (const finalOpenWidth of [1148, 1628]) {
      container.clientWidth = finalOpenWidth;
      controller.notify();
      frames.flush();
      frames.flush();
    }

    expect(assignments).toEqual(["page-width", "page-width", "page-width", "page-width"]);
    expect(update).toHaveBeenCalledTimes(4);

    fit.value = "page";
    container.clientHeight = 720;
    controller.notify();
    frames.flush();
    frames.flush();
    expect(assignments.at(-1)).toBe("page-fit");
    expect(update).toHaveBeenCalledTimes(5);
  });

  it("updates custom zoom layout without replacing the user's numeric scale", () => {
    const frames = frameQueue();
    const container = { clientWidth: 1628, clientHeight: 1000 };
    const { viewer, assignments, update } = viewerHarness();
    const controller = createPdfViewerResizeController({
      getContainer: () => container,
      getViewer: () => viewer,
      getFit: () => "custom",
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
    });

    controller.notify();
    frames.flush();
    frames.flush();

    expect(assignments).toEqual([]);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("maps saved semantic fit modes and cancels pending work on dispose", () => {
    expect(pdfSemanticScaleValue("width")).toBe("page-width");
    expect(pdfSemanticScaleValue("page")).toBe("page-fit");
    expect(pdfSemanticScaleValue("custom")).toBeNull();

    const frames = frameQueue();
    const controller = createPdfViewerResizeController({
      getContainer: () => ({ clientWidth: 988, clientHeight: 900 }),
      getViewer: () => viewerHarness().viewer,
      getFit: () => "page",
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
    });
    controller.notify();
    expect(frames.size).toBe(1);
    controller.dispose();
    expect(frames.size).toBe(0);
  });

  it("wires the actual PDF scroll container instead of sidebar state timing", () => {
    const reader = readFileSync(resolve(process.cwd(), "src/components/pdf/PdfReader.tsx"), "utf8");
    expect(reader).toContain("new ResizeObserver(() => controller.notify())");
    expect(reader).toContain('event.propertyName === "left"');
    expect(reader).toContain("getFit: () => fitRef.current");
    expect(reader).not.toContain("[fit, sidebarOpen]");
  });
});
