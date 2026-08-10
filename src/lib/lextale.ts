export type LexTaleItem = { item: string; isWord: boolean; dummy?: boolean };

export const LEXTALE_ITEMS: LexTaleItem[] = [
  { item: "platery", isWord: false, dummy: true },
  { item: "denial", isWord: true, dummy: true },
  { item: "generic", isWord: true, dummy: true },
  { item: "mensible", isWord: false }, { item: "scornful", isWord: true },
  { item: "stoutly", isWord: true }, { item: "ablaze", isWord: true },
  { item: "kermshaw", isWord: false }, { item: "moonlit", isWord: true },
  { item: "lofty", isWord: true }, { item: "hurricane", isWord: true },
  { item: "flaw", isWord: true }, { item: "alberation", isWord: false },
  { item: "unkempt", isWord: true }, { item: "breeding", isWord: true },
  { item: "festivity", isWord: true }, { item: "screech", isWord: true },
  { item: "savoury", isWord: true }, { item: "plaudate", isWord: false },
  { item: "shin", isWord: true }, { item: "fluid", isWord: true },
  { item: "spaunch", isWord: false }, { item: "allied", isWord: true },
  { item: "slain", isWord: true }, { item: "recipient", isWord: true },
  { item: "exprate", isWord: false }, { item: "eloquence", isWord: true },
  { item: "cleanliness", isWord: true }, { item: "dispatch", isWord: true },
  { item: "rebondicate", isWord: false }, { item: "ingenious", isWord: true },
  { item: "bewitch", isWord: true }, { item: "skave", isWord: false },
  { item: "plaintively", isWord: true }, { item: "kilp", isWord: false },
  { item: "interfate", isWord: false }, { item: "hasty", isWord: true },
  { item: "lengthy", isWord: true }, { item: "fray", isWord: true },
  { item: "crumper", isWord: false }, { item: "upkeep", isWord: true },
  { item: "majestic", isWord: true }, { item: "magrity", isWord: false },
  { item: "nourishment", isWord: true }, { item: "abergy", isWord: false },
  { item: "proom", isWord: false }, { item: "turmoil", isWord: true },
  { item: "carbohydrate", isWord: true }, { item: "scholar", isWord: true },
  { item: "turtle", isWord: true }, { item: "fellick", isWord: false },
  { item: "destription", isWord: false }, { item: "cylinder", isWord: true },
  { item: "censorship", isWord: true }, { item: "celestial", isWord: true },
  { item: "rascal", isWord: true }, { item: "purrage", isWord: false },
  { item: "pulsh", isWord: false }, { item: "muddy", isWord: true },
  { item: "quirty", isWord: false }, { item: "pudour", isWord: false },
  { item: "listless", isWord: true }, { item: "wrought", isWord: true },
];

export type ReaderPreset = "supportive" | "balanced" | "light";

export function scoreLexTale(answers: boolean[]) {
  const scored = LEXTALE_ITEMS.slice(3);
  let wordsCorrect = 0;
  let nonwordsCorrect = 0;
  scored.forEach((entry, index) => {
    const answer = answers[index + 3];
    if (entry.isWord && answer === true) wordsCorrect += 1;
    if (!entry.isWord && answer === false) nonwordsCorrect += 1;
  });
  return Math.round((((wordsCorrect / 40) * 100 + (nonwordsCorrect / 20) * 100) / 2) * 10) / 10;
}

export function profileForScore(score: number): { band: string; preset: ReaderPreset; summary: string } {
  if (score < 60) return {
    band: "约 B1 或以下",
    preset: "supportive",
    summary: "先给更多短释义与句子拆解，让正文保持可读。",
  };
  if (score < 80) return {
    band: "约 B2",
    preset: "balanced",
    summary: "保持原文为主，只在真正卡住时展开英文解释。",
  };
  return {
    band: "约 C1-C2",
    preset: "light",
    summary: "尽量不打断阅读，只处理低频词、长句和隐含关系。",
  };
}
