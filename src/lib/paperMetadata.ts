function metadataText(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized && normalized.toLocaleLowerCase() !== "untitled" ? normalized : null;
}

export function paperYearFromMetadata(...values: unknown[]) {
  for (const value of values) {
    const text = metadataText(value);
    const match = text?.match(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/);
    if (match) return match[1];
  }
  return null;
}

export function paperAuthorLabel(author: string | null | undefined) {
  const firstAuthor = metadataText(author)?.split(/\s*(?:;|\band\b|&)\s*/i)[0] ?? "";
  if (!firstAuthor) return null;
  const commaParts = firstAuthor.split(",").map((part) => part.trim()).filter(Boolean);
  if (commaParts.length > 1) return commaParts[0];
  const words = firstAuthor.replace(/[\d*†‡]+$/g, "").trim().split(/\s+/);
  return words.at(-1) ?? null;
}

export function paperMetadataText(value: unknown) {
  return metadataText(value);
}
