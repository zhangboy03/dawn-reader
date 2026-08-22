import { describe, expect, it } from "vitest";
import { isSuccessfulTargetPageRender } from "./pdfOpenCoordinator";

const successful = {
  generation: 3,
  currentGeneration: 3,
  targetPage: 8,
  pageNumber: 8,
  error: null,
  canvas: { width: 1200, height: 1600 },
  cssTransform: false,
  isDetailView: false,
  canvasAttached: true,
  canvasVisible: true,
  pageAttached: true,
  pageVisible: true,
  layoutCurrent: true,
};

describe("PDF first-paint readiness", () => {
  it("accepts a successfully rendered restored target without inspecting page pixels or text", () => {
    expect(isSuccessfulTargetPageRender(successful)).toBe(true);
  });

  it("does not accept another page, a stale open generation, or a render error", () => {
    expect(isSuccessfulTargetPageRender({ ...successful, pageNumber: 1 })).toBe(false);
    expect(isSuccessfulTargetPageRender({ ...successful, currentGeneration: 4 })).toBe(false);
    expect(isSuccessfulTargetPageRender({ ...successful, error: new Error("paint failed") })).toBe(false);
  });

  it("requires a real canvas with non-zero geometry", () => {
    expect(isSuccessfulTargetPageRender({ ...successful, canvas: null })).toBe(false);
    expect(isSuccessfulTargetPageRender({ ...successful, canvas: { width: 0, height: 1600 } })).toBe(false);
  });

  it("rejects transform-only, detached, invisible, or stale-layout candidates", () => {
    expect(isSuccessfulTargetPageRender({ ...successful, cssTransform: true })).toBe(false);
    expect(isSuccessfulTargetPageRender({ ...successful, isDetailView: true })).toBe(false);
    expect(isSuccessfulTargetPageRender({ ...successful, canvasAttached: false })).toBe(false);
    expect(isSuccessfulTargetPageRender({ ...successful, canvasVisible: false })).toBe(false);
    expect(isSuccessfulTargetPageRender({ ...successful, pageAttached: false })).toBe(false);
    expect(isSuccessfulTargetPageRender({ ...successful, pageVisible: false })).toBe(false);
    expect(isSuccessfulTargetPageRender({ ...successful, layoutCurrent: false })).toBe(false);
  });
});
