import { describe, expect, it } from "vitest";
import { bookChatContext, bookChatSystemPrompt, safeBookChatMessages } from "./chatPrompt";

describe("book chat prompt", () => {
  it("keeps selected text isolated from nearby context", () => {
    const context = bookChatContext({
      text: "selected course claim",
      context: { before: "before", after: "after" },
      bookTitle: "Course",
    });
    expect(context).toContain("<selection>\nselected course claim\n</selection>");
    expect(context).toContain("<context_after>\nafter\n</context_after>");
  });

  it("describes search honestly based on availability", () => {
    expect(bookChatSystemPrompt(true)).toContain("call search_web");
    expect(bookChatSystemPrompt(false)).toContain("no live web access");
  });

  it("limits and sanitizes conversation history", () => {
    const messages = Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 ? "assistant" as const : "user" as const,
      content: ` message ${index} `,
    }));
    const safe = safeBookChatMessages(messages);
    expect(safe).toHaveLength(10);
    expect(safe[0].content).toBe("message 2");
  });
});
