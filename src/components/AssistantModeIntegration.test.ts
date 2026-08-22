import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("reader-owned assistance mode", () => {
  it("keeps assistant choices off the library shelf", () => {
    const source = readFileSync("src/components/Library.tsx", "utf8");

    expect(source).not.toContain("book-assistant-menu");
    expect(source).not.toContain("pdf-assistance-summary");
    expect(source).not.toContain("英文先行 · 中文按需");
    expect(source).not.toContain("loadBookAssistantModes");
  });

  it("uses the same direct mode control in EPUB and PDF readers", () => {
    const epub = readFileSync("src/components/Reader.tsx", "utf8");
    const pdf = readFileSync("src/components/pdf/PdfReader.tsx", "utf8");
    const pdfCard = readFileSync("src/components/pdf/PdfSelectionCard.tsx", "utf8");

    expect(epub.match(/<AssistantModeToggle/g)).toHaveLength(1);
    expect(pdf).not.toContain("AssistantModeToggle");
    expect(pdfCard.match(/<AssistantModeToggle/g)).toHaveLength(1);
    expect(epub).not.toContain("assistant-mode-slot");
    expect(pdf).not.toContain("dawn-pdf-assistant-slot");
    expect(epub).toContain("loadBookAssistantModes()[source.id]");
    expect(epub).toContain("saveBookAssistantMode(source.id, next)");
    expect(pdf).toContain("saveBookAssistantMode(source.id, next)");
    expect(pdf).toContain('fetch("/api/chat"');
  });

  it("removes capability chrome and duplicated selection from the shared question UI", () => {
    const epub = readFileSync("src/components/Reader.tsx", "utf8");
    const chat = readFileSync("src/components/selection-assist/SelectionChat.tsx", "utf8");

    expect(epub).not.toContain("局部上下文");
    expect(epub).not.toContain("可联网");
    expect(epub).not.toContain('className="chat-selection"');
    expect(chat).toContain('placeholder={messages.length ? "继续提问…" : "输入你想问的问题…"}');
    expect(chat).toContain("正在回答…");
  });
});
