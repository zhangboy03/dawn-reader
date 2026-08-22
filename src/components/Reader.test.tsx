// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Reader } from "./Reader";
import { configureClientAccountContext } from "../lib/clientAccountContext";

const profile = { score: null, band: "未校准 · 平衡辅助", preset: "balanced" as const };
const storageValues = new Map<string, string>();
const testStorage: Storage = {
  get length() { return storageValues.size; },
  clear: () => storageValues.clear(),
  getItem: (key) => storageValues.get(key) ?? null,
  key: (index) => [...storageValues.keys()][index] ?? null,
  removeItem: (key) => { storageValues.delete(key); },
  setItem: (key, value) => { storageValues.set(key, value); },
};

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: testStorage,
});

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
});

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: class {
    observe() {}
    disconnect() {}
  },
});

beforeEach(() => {
  testStorage.clear();
  configureClientAccountContext({
    accountId: "reader-test",
    environment: "beta",
    canClaimLegacyLocalData: false,
    role: "reader",
    authKind: "dawn_session",
  });
});

describe("Reader chrome", () => {
  it("keeps EPUB navigation outside the reflowing reading stage", () => {
    const markup = renderToStaticMarkup(<Reader
      source={{
        type: "epub",
        title: "A Stable Page",
        file: {} as File,
        assistantMode: "rewrite",
      }}
      profile={profile}
      onClose={() => undefined}
    />);

    const header = markup.indexOf('class="reader-topbar"');
    const main = markup.indexOf('class="reading-stage epub-stage"');
    const footer = markup.indexOf('class="reader-bottombar"');

    expect(header).toBeGreaterThan(-1);
    expect(main).toBeGreaterThan(header);
    expect(footer).toBeGreaterThan(main);
    expect(markup.slice(main, footer)).not.toContain("page-controls");
    expect(markup).toContain('aria-label="阅读导航"');
    expect(markup).toContain('aria-label="查看目录"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("正在恢复阅读位置…");
    expect(markup.match(/class="epub-renderer-slot"/g)).toHaveLength(2);
    expect(markup).not.toContain("data-epub-slot-state");
  });

  it("keeps the committed EPUB layer visible while a replacement is staged", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const readerSource = readFileSync("src/components/Reader.tsx", "utf8");

    expect(css).toMatch(/\.epub-renderer-slot\s*\{[^}]*position:\s*absolute;[^}]*visibility:\s*hidden;/s);
    expect(css).toMatch(/\.epub-renderer-slot\s*\{[^}]*left:\s*50%;[^}]*transform:\s*translateX\(-50%\) scale\(var\(--epub-slot-scale, 1\)\);/s);
    expect(css).toMatch(/\.epub-renderer-slot\s*\{[^}]*transform-origin:\s*top center;/s);
    expect(css).toMatch(/\[data-epub-slot-state="ready"\]\s*\{[^}]*visibility:\s*visible;[^}]*pointer-events:\s*none;/s);
    expect(css).toMatch(/\[data-epub-slot-state="active"\]\s*\{[^}]*visibility:\s*visible;/s);
    expect(css).not.toMatch(/\.epub-frame\.is-restoring\s*>\s*\*\s*\{[^}]*visibility:\s*hidden/);
    expect(readerSource).toContain('manager: "default"');
    expect(readerSource).not.toContain('manager: "continuous"');
    expect(readerSource).not.toContain("manager.scrollBy");
    expect(readerSource).not.toContain("epubRestoreDirection");
    expect(readerSource).not.toContain("currentLocation(");
    expect(readerSource).toContain("rendition.getRange");
    expect(readerSource).toContain("rendition.reportLocation");
    expect(readerSource).toContain("new EpubLayoutSignatureTracker");
    expect(readerSource).toContain("prepareSlotForCommit");
    expect(readerSource).toContain('host.style.width = `${config.size.width}px`');
    expect(readerSource).toContain('host.style.height = `${config.size.height}px`');
    expect(readerSource).toContain("epubRendererFitScale");
    expect(readerSource).toContain("epubNavigationTargetFromLink");
    expect(readerSource).toContain('cause: "link"');
    expect(readerSource).toContain('image.loading = "eager"');
    expect(readerSource).toContain("hasFocus()");
    expect(readerSource).toContain("iframe?.focus({ preventScroll: true })");
    expect(readerSource).not.toContain('annotations.highlight(cfiRange');
    expect(readerSource).toContain("selection?.addRange(range)");
  });

  it("uses a dynamic viewport shell without fixing the document body", () => {
    const css = readFileSync("src/styles.css", "utf8");

    expect(css).toMatch(/\.reader-shell\s*\{[\s\S]*?height:\s*100dvh;/);
    expect(css).toMatch(/\.reader-shell-epub\s*\{\s*grid-template-rows:\s*auto minmax\(0, 1fr\) auto;/);
    expect(css).not.toMatch(/body\.reader-active\s*\{[^}]*position:\s*fixed/);
  });

  it("keeps the figure viewer fitted and removes instructional chrome", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const readerSource = readFileSync("src/components/Reader.tsx", "utf8");

    expect(readerSource).not.toContain("imageZoomed");
    expect(readerSource).not.toContain("查看原始尺寸");
    expect(readerSource).not.toContain("适应窗口");
    expect(readerSource).not.toContain("点击留白关闭");
    expect(readerSource).not.toContain("可拖动或双指缩放");
    expect(readerSource).toContain('"min-width": "32px !important"');
    expect(readerSource).toContain('"min-height": "30px !important"');
    expect(readerSource).toContain('"font-size": ".56em !important"');
    expect(css).toMatch(/\.image-viewer-canvas\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s);
    expect(css).toMatch(/\.image-viewer-canvas img\s*\{[^}]*max-width:\s*100%;[^}]*max-height:\s*100%;/s);
    expect(css).not.toContain(".image-viewer-hint");
    expect(css).not.toContain(".image-viewer.zoomed");
  });

  it("closes settings on the outside press without passing it to the reading surface", () => {
    render(<Reader
      source={{
        type: "text",
        title: "Quiet settings",
        text: "A paragraph that should stay where it is.",
        assistantMode: "rewrite",
      }}
      profile={profile}
      onClose={() => undefined}
    />);

    fireEvent.click(screen.getByRole("button", { name: "阅读设置" }));
    expect(screen.getByRole("dialog", { name: "阅读设置" })).not.toBeNull();

    const backdrop = screen.getByRole("button", { name: "关闭阅读设置" });
    const outsidePress = createEvent.pointerDown(backdrop);
    fireEvent(backdrop, outsidePress);

    expect(outsidePress.defaultPrevented).toBe(true);
    expect(screen.queryByRole("dialog", { name: "阅读设置" })).toBeNull();
  });

  it("keeps the reading settings focused on font size and paper color", () => {
    const view = render(<Reader
      source={{
        type: "text",
        title: "Quiet appearance",
        text: "A page with opinionated typography.",
        assistantMode: "rewrite",
      }}
      profile={profile}
      onClose={() => undefined}
    />);

    const appearance = within(view.container);
    fireEvent.click(appearance.getByRole("button", { name: "阅读设置" }));

    expect(appearance.getByRole("button", { name: "减小字号" })).not.toBeNull();
    expect(appearance.getByRole("button", { name: "增大字号" })).not.toBeNull();
    expect(appearance.getByRole("button", { name: "纸白" })).not.toBeNull();
    expect(appearance.getByRole("button", { name: "暖褐" })).not.toBeNull();
    expect(appearance.getByRole("button", { name: "夜读" })).not.toBeNull();
    expect(appearance.getByText("19", { selector: "output" })).not.toBeNull();
    for (const retiredLabel of ["行距", "行长", "对齐", "段落", "排版", "位置"]) {
      expect(appearance.queryByText(retiredLabel)).toBeNull();
    }

    fireEvent.click(appearance.getByRole("button", { name: "增大字号" }));
    expect(appearance.getByText("20", { selector: "output" })).not.toBeNull();

    const night = appearance.getByRole("button", { name: "夜读" });
    fireEvent.click(night);
    expect(night.getAttribute("aria-pressed")).toBe("true");
    expect(view.container.querySelector(".reader-theme-night .paper-night")).not.toBeNull();
  });

  it("changes paper color without a staged CSS fade or EPUB reflow", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const readerSource = readFileSync("src/components/Reader.tsx", "utf8");
    const appearanceEffectStart = readerSource.indexOf('requestEpubReflow("appearance")');
    const appearanceEffectEnd = readerSource.indexOf("useLayoutEffect", appearanceEffectStart);
    const appearanceEffect = readerSource.slice(appearanceEffectStart, appearanceEffectEnd);

    expect(css).not.toMatch(/\.reading-stage\s*\{[^}]*transition:\s*background-color/s);
    expect(css).not.toMatch(/\.paper\s*\{[^}]*transition:\s*background-color/s);
    expect(css).not.toMatch(/\.epub-frame\s*\{[^}]*transition:\s*background-color/s);
    expect(readerSource).toContain("applyEpubTheme(renderer.rendition, settingsRef.current)");
    expect(appearanceEffect).not.toContain("settings.theme");
  });

  it("uses an exclusive outside-press layer while selection help is open", async () => {
    render(<Reader
      source={{
        type: "text",
        title: "Quiet selection",
        text: "A selected phrase stays on the current page.",
        assistantMode: "rewrite",
      }}
      profile={profile}
      onClose={() => undefined}
    />);

    const paragraph = screen.getByText("A selected phrase stays on the current page.");
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    const selectionRect = { left: 220, right: 420, top: 240, bottom: 270, width: 200, height: 30 };
    const preservedRange = range.cloneRange();
    const geometry = {
      getClientRects: { value: () => [selectionRect] },
      getBoundingClientRect: { value: () => selectionRect },
    };
    Object.defineProperties(preservedRange, {
      ...geometry,
      cloneRange: { value: () => preservedRange },
    });
    Object.defineProperties(range, {
      ...geometry,
      // Reader intentionally retains a clone. Keep the controlled jsdom
      // geometry on that retained range so the first shared layout can settle.
      cloneRange: { value: () => preservedRange },
    });
    const stage = paragraph.closest<HTMLElement>(".reading-stage")!;
    Object.defineProperty(stage, "getBoundingClientRect", {
      value: () => ({ left: 0, right: 1024, top: 64, bottom: 700, width: 1024, height: 636 }),
    });
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    fireEvent.pointerUp(paragraph, { pointerType: "mouse", clientX: 420, clientY: 260 });

    // The production surface is deliberately hidden from paint and the
    // accessibility tree until its first collision-safe layout is committed.
    // Await that visible state rather than asserting during initialization.
    const dialog = await screen.findByRole("dialog", { name: "简明英文" });
    expect(dialog.getAttribute("aria-hidden")).not.toBe("true");
    const backdrop = document.querySelector<HTMLElement>("[data-selection-assist-dismiss-layer]")!;
    const outsidePress = createEvent.pointerDown(backdrop, { pointerId: 3 });
    fireEvent(backdrop, outsidePress);

    expect(outsidePress.defaultPrevented).toBe(true);
    expect(screen.getByRole("dialog", { name: "简明英文" })).not.toBeNull();
    const outsideRelease = createEvent.pointerUp(backdrop, { pointerId: 3 });
    fireEvent(backdrop, outsideRelease);
    expect(outsideRelease.defaultPrevented).toBe(true);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "简明英文" })).toBeNull());
  });
});
