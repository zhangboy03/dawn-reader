// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Reader } from "./Reader";

const profile = { score: null, band: "未校准 · 平衡辅助", preset: "balanced" as const };

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
  });

  it("uses a dynamic viewport shell without fixing the document body", () => {
    const css = readFileSync("src/styles.css", "utf8");

    expect(css).toMatch(/\.reader-shell\s*\{[\s\S]*?height:\s*100dvh;/);
    expect(css).toMatch(/\.reader-shell-epub\s*\{\s*grid-template-rows:\s*auto minmax\(0, 1fr\) auto;/);
    expect(css).not.toMatch(/body\.reader-active\s*\{[^}]*position:\s*fixed/);
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

  it("uses an exclusive outside-press layer while selection help is open", () => {
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
    Object.defineProperty(range, "getBoundingClientRect", {
      value: () => ({ left: 220, right: 420, top: 240, bottom: 270, width: 200, height: 30 }),
    });
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    fireEvent.mouseUp(paragraph);

    expect(screen.getByRole("dialog", { name: "简明英文" })).not.toBeNull();
    const backdrop = screen.getAllByRole("button", { name: "关闭解释" })[0];
    const outsidePress = createEvent.pointerDown(backdrop);
    fireEvent(backdrop, outsidePress);

    expect(outsidePress.defaultPrevented).toBe(true);
    expect(screen.queryByRole("dialog", { name: "简明英文" })).toBeNull();
  });
});
