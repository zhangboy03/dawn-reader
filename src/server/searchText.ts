export function plainTextFromSearchSnippet(text: string | null | undefined) {
  return (text ?? "")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    // Decode only the entities above, then remove markup last so an entity
    // replacement cannot create a new tag after sanitization.
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
