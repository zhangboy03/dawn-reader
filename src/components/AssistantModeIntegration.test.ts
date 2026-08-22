import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("rewrite-first selection assistance hierarchy", () => {
  it("keeps assistant choices off the library shelf", () => {
    const source = readFileSync("src/components/Library.tsx", "utf8");

    expect(source).not.toContain("book-assistant-menu");
    expect(source).not.toContain("pdf-assistance-summary");
    expect(source).not.toContain("英文先行 · 中文按需");
    expect(source).not.toContain("loadBookAssistantModes");
  });

  it("always starts with rewrite and exposes question as a result-level escalation", () => {
    const epub = readFileSync("src/components/Reader.tsx", "utf8");
    const pdf = readFileSync("src/components/pdf/PdfReader.tsx", "utf8");
    const pdfCard = readFileSync("src/components/pdf/PdfSelectionCard.tsx", "utf8");

    expect(epub).not.toContain("AssistantModeToggle");
    expect(pdf).not.toContain("AssistantModeToggle");
    expect(pdfCard).not.toContain("AssistantModeToggle");
    expect(epub).toContain('setAssistRoute("rewrite")');
    expect(epub).toContain('void requestRewrite(text, context, "english", version)');
    expect(pdf).toContain('setAssistRoute("rewrite")');
    expect(pdf).toContain("void requestEnglish(snapshot, version)");
    expect(epub).toContain('"问这段"');
    expect(pdfCard).toContain('"问这段"');
    expect(epub).toContain('const [chineseDetail, setChineseDetail]');
    expect(epub).toContain('className={`reader-chinese-detail');
    expect(epub).not.toContain("setAssistanceMode");
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
    expect(chat).not.toContain("scrollIntoView");
    expect(chat).toContain('closest<HTMLElement>("[data-selection-assist-body]")');
  });
});
