import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Reader } from "./Reader";

const profile = { score: null, band: "未校准 · 平衡辅助", preset: "balanced" as const };

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
  });

  it("uses a dynamic viewport shell without fixing the document body", () => {
    const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

    expect(css).toMatch(/\.reader-shell\s*\{[\s\S]*?height:\s*100dvh;/);
    expect(css).toMatch(/\.reader-shell-epub\s*\{\s*grid-template-rows:\s*auto minmax\(0, 1fr\) auto;/);
    expect(css).not.toMatch(/body\.reader-active\s*\{[^}]*position:\s*fixed/);
  });
});
