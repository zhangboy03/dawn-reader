import { describe, expect, it } from 'vitest';
import { getWordBoundaries, wordAtOffset } from './wordBoundary';

describe('getWordBoundaries', () => {
  it('keeps contractions, possessives, and hyphenated terms whole', () => {
    const value = "can't reader’s state-of-the-art";
    expect(getWordBoundaries(value).map(word => word.text)).toEqual([
      "can't",
      'reader’s',
      'state-of-the-art',
    ]);
  });

  it('excludes surrounding punctuation and does not merge an em dash', () => {
    const value = '“alpha,” beta—gamma.';
    expect(getWordBoundaries(value).map(word => word.text)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('uses Unicode word-like characters rather than ASCII-only matching', () => {
    const value = 'naïve café Привет Ελληνικά';
    expect(getWordBoundaries(value).map(word => word.text)).toEqual([
      'naïve',
      'café',
      'Привет',
      'Ελληνικά',
    ]);
  });
});

describe('wordAtOffset', () => {
  const words = getWordBoundaries('alpha  beta');

  it('does not jump a lower endpoint from whitespace to the next word', () => {
    expect(wordAtOffset(words, 6, 'forward')).toBeNull();
  });

  it('does not jump an upper endpoint from whitespace to the previous word', () => {
    expect(wordAtOffset(words, 6, 'backward')).toBeNull();
  });

  it('does not jump across a gap from the end of the previous word', () => {
    expect(wordAtOffset(words, 5, 'forward')).toBeNull();
  });

  it('does not jump across a gap from the start of the next word', () => {
    expect(wordAtOffset(words, 7, 'backward')).toBeNull();
  });
});
