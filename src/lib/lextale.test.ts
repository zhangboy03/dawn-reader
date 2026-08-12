import { describe, expect, it } from "vitest";
import { LEXTALE_ITEMS, profileForScore, scoreLexTale } from "./lextale";

describe("LexTALE scoring", () => {
  it("gives 100 for all correct scored responses", () => {
    expect(scoreLexTale(LEXTALE_ITEMS.map((item) => item.isWord))).toBe(100);
  });

  it("does not score the three dummy responses", () => {
    const correct = LEXTALE_ITEMS.map((item) => item.isWord);
    correct[0] = !correct[0];
    correct[1] = !correct[1];
    correct[2] = !correct[2];
    expect(scoreLexTale(correct)).toBe(100);
  });

  it("maps scores to assistance presets", () => {
    expect(profileForScore(59).preset).toBe("supportive");
    expect(profileForScore(60).preset).toBe("balanced");
    expect(profileForScore(80).preset).toBe("light");
  });
});
