// @vitest-environment jsdom

import { useRef, useState } from "react";
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SelectionAssistAnchor } from "../../lib/selectionAssistAnchor";
import { SelectionAssistSurface } from "./SelectionAssistSurface";

const anchor: SelectionAssistAnchor = {
  rects: [{ left: 120, top: 300, right: 240, bottom: 324, width: 120, height: 24 }],
  focusRect: { left: 120, top: 300, right: 240, bottom: 324, width: 120, height: 24 },
  focusPoint: { x: 180, y: 312 },
  focusIndex: 0,
  direction: "forward",
  strategy: "direction",
};

class Observer {
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: Observer });
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: Object.assign(new EventTarget(), { offsetLeft: 0, offsetTop: 0, width: 390, height: 600 }),
  });
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SelectionAssistSurface", () => {
  it("keeps chrome and footer fixed while only the shared body owns scrolling", () => {
    const parentWheel = vi.fn();
    render(<div onWheel={parentWheel}>
      <SelectionAssistSurface
        title="简明英文"
        ariaLabel="所选文字辅助"
        actions={<button type="button">中文</button>}
        footer={<form><textarea aria-label="提问" /><button type="button">发送</button></form>}
        onDismiss={() => undefined}
        getAnchor={() => anchor}
        getBoundary={() => ({ left: 0, top: 64, right: 390, bottom: 590 })}
        width={420}
        maximumHeight={560}
        minimumUsefulHeight={184}
      ><p>First result</p></SelectionAssistSurface>
    </div>);

    const dialog = screen.getByRole("dialog", { name: "简明英文" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog.querySelector(".selection-assist-header")).not.toBeNull();
    expect(dialog.querySelector(".selection-assist-body")).not.toBeNull();
    expect(dialog.querySelector(".selection-assist-footer")).not.toBeNull();
    fireEvent.wheel(dialog.querySelector(".selection-assist-body")!);
    expect(parentWheel).not.toHaveBeenCalled();
  });

  it("consumes the complete first outside pointer before dismissing", () => {
    const onDismiss = vi.fn();
    render(<SelectionAssistSurface
      title="简明英文"
      ariaLabel="所选文字辅助"
      onDismiss={onDismiss}
      getAnchor={() => anchor}
    ><p>Result</p></SelectionAssistSurface>);

    const backdrop = document.querySelector<HTMLElement>("[data-selection-assist-dismiss-layer]")!;
    const down = createEvent.pointerDown(backdrop, { pointerId: 7 });
    fireEvent(backdrop, down);
    expect(down.defaultPrevented).toBe(true);
    expect(onDismiss).not.toHaveBeenCalled();

    const up = createEvent.pointerUp(backdrop, { pointerId: 7 });
    fireEvent(backdrop, up);
    expect(up.defaultPrevented).toBe(true);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("contains internal gestures without cancelling textarea focus or control defaults", () => {
    render(<SelectionAssistSurface
      title="问这段内容"
      ariaLabel="问这段内容"
      onDismiss={() => undefined}
      getAnchor={() => anchor}
      footer={<textarea aria-label="向 AI 提问" />}
    ><button type="button">正文按钮</button></SelectionAssistSurface>);

    const textarea = screen.getByRole("textbox", { name: "向 AI 提问" });
    const pointer = createEvent.pointerDown(textarea, { pointerId: 9 });
    fireEvent(textarea, pointer);
    expect(pointer.defaultPrevented).toBe(false);
    textarea.focus();
    expect(textarea).toHaveFocus();
  });


  it("does not leave an invisible reader-blocking layer when no current anchor is visible", () => {
    const { container } = render(<SelectionAssistSurface
      title="简明英文"
      ariaLabel="所选文字辅助"
      onDismiss={() => undefined}
      getAnchor={() => null}
    ><p>Result</p></SelectionAssistSurface>);

    const backdrop = container.querySelector<HTMLElement>(".selection-assist-dismiss-layer");
    const dialog = container.querySelector<HTMLElement>(".selection-assist-surface");
    expect(backdrop).toHaveStyle({ pointerEvents: "none" });
    expect(backdrop).toHaveAttribute("aria-hidden", "true");
    expect(dialog).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps wide nonmodal focus on the reading surface", async () => {
    Object.assign(window.visualViewport!, { width: 1024, height: 700 });
    const returnButton = document.createElement("button");
    returnButton.textContent = "Reading focus";
    document.body.appendChild(returnButton);
    returnButton.focus();
    render(<SelectionAssistSurface
      title="简明英文"
      ariaLabel="所选文字辅助"
      onDismiss={() => undefined}
      getAnchor={() => anchor}
      getBoundary={() => ({ left: 0, top: 64, right: 1024, bottom: 690 })}
    ><button type="button">正文按钮</button></SelectionAssistSurface>);

    const dialog = screen.getByRole("dialog", { name: "简明英文" });
    expect(dialog).not.toHaveAttribute("aria-modal");
    await waitFor(() => expect(returnButton).toHaveFocus());
    returnButton.remove();
  });

  it("enters and traps compact focus, dismisses on Escape, and returns focus", async () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      const returnRef = useRef<HTMLButtonElement>(null);
      return <>
        <button ref={returnRef}>阅读页面</button>
        {open && <SelectionAssistSurface
          title="问这段内容"
          ariaLabel="问这段内容"
          onDismiss={() => setOpen(false)}
          getAnchor={() => anchor}
          getBoundary={() => ({ left: 0, top: 64, right: 390, bottom: 590 })}
          returnFocus={() => returnRef.current}
          footer={<textarea data-selection-assist-autofocus aria-label="向 AI 提问" />}
        ><button type="button">正文按钮</button></SelectionAssistSurface>}
      </>;
    }
    render(<Harness />);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "向 AI 提问" })).toHaveFocus());
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(screen.queryByRole("dialog", { name: "问这段内容" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "阅读页面" })).toHaveFocus());
  });
});
