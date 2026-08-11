export function isSingleWord(text: string) {
  const trimmed = text.trim();
  if (!trimmed || /\s/u.test(trimmed)) return false;
  const parts = trimmed.split(/[^\p{L}\p{N}'’\u2010-\u2015-]+/u).filter(Boolean);
  return parts.length === 1 && /\p{L}/u.test(parts[0]);
}
