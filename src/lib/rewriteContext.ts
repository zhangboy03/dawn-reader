export type RewriteContext = {
  before: string;
  after: string;
};

function normalize(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function contextFromParagraphs(
  paragraphs: string[],
  paragraphIndex: number,
  selection: string,
  limit = 700,
): RewriteContext {
  const current = paragraphs[paragraphIndex] ?? "";
  const selectionIndex = current.indexOf(selection);
  const beforeInParagraph = selectionIndex >= 0 ? current.slice(0, selectionIndex) : "";
  const afterInParagraph = selectionIndex >= 0 ? current.slice(selectionIndex + selection.length) : "";

  const before = normalize([paragraphs[paragraphIndex - 1], beforeInParagraph].filter(Boolean).join("\n"));
  const after = normalize([afterInParagraph, paragraphs[paragraphIndex + 1]].filter(Boolean).join("\n"));

  return {
    before: before.slice(-limit),
    after: after.slice(0, limit),
  };
}
