import { describe, expect, it } from "vitest";
import {
  mergeEvidenceRecord,
  ReadingActivityRecorder,
  sentenceAroundSelection,
  summarizeReadingTime,
  type ReadingEvidenceDraft,
  type ReadingTimeSlice,
} from "./readingEvidence";

describe("reading evidence context", () => {
  it("keeps the selected word inside its surrounding sentence", () => {
    expect(sentenceAroundSelection(
      "An earlier sentence. The market can remain",
      "irrational",
      "longer than you can remain solvent. A later sentence.",
    )).toBe("The market can remain irrational longer than you can remain solvent.");
  });
});

describe("reading evidence merging", () => {
  const draft: ReadingEvidenceDraft = {
    id: "selection-1",
    bookId: "book-1",
    editionId: "book-1",
    bookTitle: "Antifragile",
    kind: "word",
    selectedText: "fragile",
    sentenceText: "A fragile object dislikes volatility.",
    contextBefore: "A",
    contextAfter: "object dislikes volatility.",
    anchor: { cfi: "epubcfi(/6/4)", href: "chapter.xhtml", percentage: 12 },
    explanation: {
      id: "explanation-1",
      mode: "english",
      text: "fragile /ˈfrædʒaɪl/ — easily damaged",
      presentedAt: "2026-08-18T08:00:00.000Z",
    },
  };

  it("appends a later full explanation without duplicating the lookup", () => {
    const first = mergeEvidenceRecord(undefined, draft);
    const second = mergeEvidenceRecord(first, {
      ...draft,
      explanation: {
        id: "explanation-2",
        mode: "chinese",
        text: "本义：脆弱的\n此处：无法从波动中获益",
        presentedAt: "2026-08-18T08:01:00.000Z",
      },
    });
    expect(second.id).toBe("selection-1");
    expect(second.explanations).toHaveLength(2);
    expect(second.updatedAt).toBe("2026-08-18T08:01:00.000Z");
  });
});

describe("reading activity recorder", () => {
  it("credits at most one active window and ignores duplicate evidence", () => {
    let mono = 0;
    let wall = new Date("2026-08-18T08:00:00.000Z");
    const slices: ReadingTimeSlice[] = [];
    const recorder = new ReadingActivityRecorder({
      bookId: "book-1",
      bookTitle: "Antifragile",
      onSlice: (slice) => { slices.push(slice); },
      nowMonotonic: () => mono,
      nowWall: () => wall,
      activeCapMs: 60_000,
    });
    recorder.setEligible(true);
    expect(recorder.signal("open")).toBe(true);
    expect(recorder.signal("open")).toBe(false);
    mono = 75_000;
    wall = new Date("2026-08-18T08:01:15.000Z");
    expect(recorder.flush()).toBe(60_000);
    expect(slices).toHaveLength(1);
  });

  it("does not bridge hidden time", () => {
    let mono = 0;
    const slices: ReadingTimeSlice[] = [];
    const recorder = new ReadingActivityRecorder({
      bookId: null,
      bookTitle: "Book",
      onSlice: (slice) => { slices.push(slice); },
      nowMonotonic: () => mono,
      nowWall: () => new Date("2026-08-18T08:00:20.000Z"),
    });
    recorder.setEligible(true);
    recorder.signal("open");
    mono = 20_000;
    recorder.setEligible(false);
    mono = 120_000;
    recorder.setEligible(true);
    recorder.flush();
    expect(slices.reduce((sum, item) => sum + item.activeMs, 0)).toBe(20_000);
  });
});

describe("reading time summary", () => {
  it("separates today from the rolling seven-day total", () => {
    const slices: ReadingTimeSlice[] = [
      { id: "1", bookId: null, bookTitle: "A", startedAt: "2026-08-18T07:59:00.000Z", endedAt: "2026-08-18T08:00:00.000Z", activeMs: 60_000 },
      { id: "2", bookId: null, bookTitle: "A", startedAt: "2026-08-14T08:00:00.000Z", endedAt: "2026-08-14T08:01:00.000Z", activeMs: 60_000 },
    ];
    expect(summarizeReadingTime(slices, new Date("2026-08-18T09:00:00.000Z")))
      .toEqual({ todayMs: 60_000, weekMs: 120_000 });
  });
});
