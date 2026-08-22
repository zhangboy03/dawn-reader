// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { selectionAssistAutoUpdate } from "./selectionAssistAutoUpdate";

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  observed: Element[] = [];
  disconnected = false;
  constructor(readonly callback: ResizeObserverCallback) { FakeResizeObserver.instances.push(this); }
  observe(element: Element) { this.observed.push(element); }
  unobserve() {}
  disconnect() { this.disconnected = true; }
  fire() { this.callback([], this as unknown as ResizeObserver); }
}

class FakeMutationObserver {
  static instances: FakeMutationObserver[] = [];
  disconnected = false;
  constructor(readonly callback: MutationCallback) { FakeMutationObserver.instances.push(this); }
  observe() {}
  takeRecords() { return []; }
  disconnect() { this.disconnected = true; }
  fire() { this.callback([], this as unknown as MutationObserver); }
}

afterEach(() => {
  FakeResizeObserver.instances = [];
  FakeMutationObserver.instances = [];
  vi.restoreAllMocks();
});

describe("selectionAssistAutoUpdate", () => {
  it("coalesces window, visualViewport, selection, iframe/PDF scroll, zoom-layout and content resize", () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const visualViewport = Object.assign(new EventTarget(), {
      offsetLeft: 0, offsetTop: 0, width: 390, height: 600,
    }) as VisualViewport;
    const iframeDocument = document.implementation.createHTMLDocument("iframe");
    const pdfScroller = new EventTarget();
    const observed = document.createElement("div");
    const onUpdate = vi.fn();

    const cleanup = selectionAssistAutoUpdate({
      windowTarget: window,
      documentTarget: document,
      visualViewport,
      eventTargets: [iframeDocument, pdfScroller],
      observedElements: [observed],
      mutationRoot: observed,
      onUpdate,
      ResizeObserverConstructor: FakeResizeObserver as unknown as typeof ResizeObserver,
      MutationObserverConstructor: FakeMutationObserver as unknown as typeof MutationObserver,
    });

    window.dispatchEvent(new Event("resize"));
    visualViewport.dispatchEvent(new Event("scroll"));
    iframeDocument.dispatchEvent(new Event("selectionchange"));
    pdfScroller.dispatchEvent(new Event("scroll"));
    pdfScroller.dispatchEvent(new Event("selectionassistlayout"));
    FakeResizeObserver.instances[0].fire();
    FakeMutationObserver.instances[0].fire();
    expect(frames).toHaveLength(1);
    frames.shift()!(0);
    expect(onUpdate).toHaveBeenCalledOnce();

    cleanup();
    expect(FakeResizeObserver.instances[0].disconnected).toBe(true);
    expect(FakeMutationObserver.instances[0].disconnected).toBe(true);
    window.dispatchEvent(new Event("resize"));
    pdfScroller.dispatchEvent(new Event("scroll"));
    expect(frames).toHaveLength(0);
  });

  it("cancels a queued frame during cleanup", () => {
    const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(42);
    const cleanup = selectionAssistAutoUpdate({ windowTarget: window, onUpdate: vi.fn() });
    cleanup();
    expect(cancel).toHaveBeenCalledWith(42);
  });
});
