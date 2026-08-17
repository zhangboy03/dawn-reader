import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { applyEpubTypographyDocument, EPUB_TYPOGRAPHY_CSS, normalizePublicationLanguage } from "./epubTypography";

const dawnOptions = {
  textAlign: "justify" as const,
  paragraphStyle: "book" as const,
  typographyMode: "dawn" as const,
};

describe("EPUB typography", () => {
  it("applies an English publication language without changing book text", () => {
    const dom = new JSDOM(`<!doctype html><html><head></head><body>
      <h1 style="text-align:center">A Considered Heading</h1>
      <p>Opening paragraph remains searchable.</p>
      <p>Ordinary body copy remains unchanged.</p>
      <div class="calibre5">&nbsp;&nbsp;&nbsp;&nbsp;Calibre-style body copy remains unchanged while receiving the same reading rhythm.</div>
      <div class="poem"><p>First line<br>Second line<br>Third line</p></div>
      <pre><code>const longIdentifier = true;</code></pre>
      <table><tr><th>Year</th><td>2026</td></tr></table>
    </body></html>`);
    const document = dom.window.document as unknown as Document;
    const before = document.body.textContent;

    const result = applyEpubTypographyDocument(document, { ...dawnOptions, publicationLanguage: "en-US" });

    expect(result).toMatchObject({ language: "en-US", english: true });
    expect(document.documentElement.lang).toBe("en-US");
    expect(document.documentElement.dataset.dawnTextAlign).toBe("justify");
    expect(document.querySelector("h1")?.hasAttribute("data-dawn-preserve-align")).toBe(true);
    expect(document.querySelector("p")?.hasAttribute("data-dawn-opening-paragraph")).toBe(true);
    expect(document.querySelector(".poem p")?.hasAttribute("data-dawn-typography-exempt")).toBe(true);
    expect(document.querySelector(".calibre5")?.hasAttribute("data-dawn-body-block")).toBe(true);
    expect(document.querySelector(".calibre5")?.hasAttribute("data-dawn-source-indent")).toBe(true);
    expect(document.querySelector("code")?.hasAttribute("data-dawn-typography-exempt")).toBe(true);
    expect(document.querySelector("td")?.hasAttribute("data-dawn-typography-exempt")).toBe(true);
    expect(document.body.textContent).toBe(before);
    expect(document.querySelectorAll("#dawn-reader-typography")).toHaveLength(1);

    applyEpubTypographyDocument(document, { ...dawnOptions, publicationLanguage: "en-US" });
    expect(document.querySelectorAll("#dawn-reader-typography")).toHaveLength(1);
  });

  it("preserves a document language and does not classify CJK as English", () => {
    const dom = new JSDOM("<!doctype html><html lang='zh-Hant'><head></head><body><p>中文段落</p></body></html>");
    const document = dom.window.document as unknown as Document;
    const result = applyEpubTypographyDocument(document, { ...dawnOptions, publicationLanguage: "en" });

    expect(result).toMatchObject({ language: "zh-Hant", english: false });
    expect(document.documentElement.lang).toBe("zh-Hant");
    expect(document.documentElement.dataset.dawnLanguage).toBe("other");
  });

  it("switches to publisher mode without deleting the reversible Dawn layer", () => {
    const dom = new JSDOM("<!doctype html><html lang='en'><head></head><body><p>Text</p></body></html>");
    const document = dom.window.document as unknown as Document;
    applyEpubTypographyDocument(document, { ...dawnOptions, typographyMode: "publisher" });

    expect(document.documentElement.dataset.dawnTypographyMode).toBe("publisher");
    expect(document.getElementById("dawn-reader-typography")?.textContent).toContain("data-dawn-typography-mode");
  });

  it("normalizes valid BCP 47-like tags and rejects unsafe values", () => {
    expect(normalizePublicationLanguage("en_US")).toBe("en-US");
    expect(normalizePublicationLanguage(["en-GB", "fr"])).toBe("en-GB");
    expect(normalizePublicationLanguage("en\" onload=alert(1)")).toBeNull();
    expect(EPUB_TYPOGRAPHY_CSS).toContain("hyphens: auto");
    expect(EPUB_TYPOGRAPHY_CSS).toContain("hyphenate-limit-chars: 6 3 3");
  });
});
