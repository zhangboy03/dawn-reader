/** A half-open UTF-16 interval for one Dawn pointing-selection word. */
export interface WordBoundary {
  start: number;
  end: number;
  text: string;
}

export type BoundaryAffinity = 'forward' | 'backward';

type SegmentPart = {
  segment: string;
  index: number;
  isWordLike?: boolean;
};

type SegmenterLike = {
  segment(input: string): Iterable<SegmentPart>;
};

type SegmenterConstructor = new (
  locales?: string | string[],
  options?: { granularity: 'word' },
) => SegmenterLike;

const CONNECTOR_ONLY = /^[\u002D\u0027\u00AD\u058A\u2010\u2011\u2019\u02BC\u30A0]+$/u;
const WORD_CHAR = /[\p{L}\p{M}\p{N}]/u;
const FALLBACK_WORD = /[\p{L}\p{M}\p{N}]+(?:[\u002D\u0027\u00AD\u058A\u2010\u2011\u2019\u02BC\u30A0][\p{L}\p{M}\p{N}]+)*/gu;
const ASCII_FALLBACK_WORD = /[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g;

function segmenterConstructor(): SegmenterConstructor | undefined {
  return (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter;
}

function mergeConnectorWords(value: string, words: WordBoundary[]): WordBoundary[] {
  if (words.length < 2) return words;

  const merged: WordBoundary[] = [];
  for (const word of words) {
    const previous = merged[merged.length - 1];
    if (previous) {
      const gap = value.slice(previous.end, word.start);
      if (gap.length > 0 && CONNECTOR_ONLY.test(gap)) {
        previous.end = word.end;
        previous.text = value.slice(previous.start, previous.end);
        continue;
      }
    }
    merged.push({ ...word });
  }
  return merged;
}

function segmentWithIntl(value: string, locale?: string): WordBoundary[] | null {
  const Segmenter = segmenterConstructor();
  if (!Segmenter) return null;

  try {
    const segments = new Segmenter(locale, { granularity: 'word' }).segment(value);
    const words: WordBoundary[] = [];
    for (const part of segments) {
      const start = part.index;
      const end = start + part.segment.length;
      const wordLike = part.isWordLike ?? WORD_CHAR.test(part.segment);
      if (wordLike && end > start) {
        words.push({ start, end, text: value.slice(start, end) });
      }
    }
    return mergeConnectorWords(value, words);
  } catch {
    return null;
  }
}

function segmentWithFallback(value: string): WordBoundary[] {
  const words: WordBoundary[] = [];
  let match: RegExpExecArray | null;
  try {
    FALLBACK_WORD.lastIndex = 0;
    while ((match = FALLBACK_WORD.exec(value))) {
      words.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
    }
  } catch {
    ASCII_FALLBACK_WORD.lastIndex = 0;
    while ((match = ASCII_FALLBACK_WORD.exec(value))) {
      words.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
    }
  }
  return words;
}

/**
 * Segment text into pointing-selection words. `Intl.Segmenter` supplies Unicode
 * word boundaries; Dawn then deliberately joins apostrophe and true-hyphen
 * connectors so contractions, possessives and ordinary hyphenated terms behave
 * as one pointing unit. Punctuation and whitespace stay outside the intervals.
 */
export function getWordBoundaries(value: string, locale?: string): WordBoundary[] {
  if (!value) return [];
  return segmentWithIntl(value, locale) ?? segmentWithFallback(value);
}

/**
 * Resolve a caret offset to the adjacent word. Forward affinity is appropriate
 * for a range's lower endpoint; backward affinity is appropriate for its upper
 * endpoint. This prevents a caret exactly between words from pulling in both.
 */
export function wordAtOffset(
  words: readonly WordBoundary[],
  offset: number,
  affinity: BoundaryAffinity,
): WordBoundary | null {
  if (!words.length) return null;
  const safeOffset = Math.max(0, offset);

  if (affinity === 'forward') {
    for (const word of words) {
      if (safeOffset >= word.start && safeOffset < word.end) return word;
      if (word.start > safeOffset) return null;
    }
    return null;
  }

  for (let index = words.length - 1; index >= 0; index -= 1) {
    const word = words[index];
    if (safeOffset > word.start && safeOffset <= word.end) return word;
    if (word.end < safeOffset) return null;
  }
  return null;
}
