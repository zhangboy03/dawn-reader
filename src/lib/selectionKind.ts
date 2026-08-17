export type SelectionKind = "word" | "phrase" | "passage";

const MAX_PHRASE_WORDS = 8;

function lexicalParts(text: string) {
  return text.match(/[\p{L}\p{N}]+(?:['’\u2010-\u2015-][\p{L}\p{N}]+)*/gu) ?? [];
}

export function isSingleWord(text: string) {
  const trimmed = text.trim();
  if (!trimmed || /\s/u.test(trimmed)) return false;
  const parts = lexicalParts(trimmed);
  return parts.length === 1 && /\p{L}/u.test(parts[0]);
}

export function selectionKind(text: string): SelectionKind {
  const trimmed = text.trim();
  if (isSingleWord(trimmed)) return "word";

  const parts = lexicalParts(trimmed);
  const hasSentenceBoundary = /[.!?。！？;；\r\n]/u.test(trimmed);
  if (
    parts.length >= 2
    && parts.length <= MAX_PHRASE_WORDS
    && parts.some((part) => /\p{L}/u.test(part))
    && !hasSentenceBoundary
  ) {
    return "phrase";
  }

  return "passage";
}
