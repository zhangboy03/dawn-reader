function stripMarkup(text: string) {
  let output = "";
  let insideTag = false;

  for (const character of text) {
    if (character === "<") {
      insideTag = true;
      continue;
    }
    if (insideTag) {
      if (character === ">") insideTag = false;
      continue;
    }
    output += character;
  }

  return output;
}

export function plainTextFromSearchSnippet(text: string | null | undefined) {
  return stripMarkup(text ?? "")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
