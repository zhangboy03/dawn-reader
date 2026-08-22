import { describe, expect, it, vi } from "vitest";
import { canSpeakWord, pronunciationWord, speakEnglishWord } from "./wordPronunciation";

class MockUtterance {
  lang = "";
  rate = 1;
  constructor(public text: string) {}
}

describe("word pronunciation", () => {
  it.each([
    ["quality", "quality"],
    ["“quality”", "quality"],
    ["self-reliance", "self-reliance"],
    ["can't", "can't"],
  ])("extracts the spoken word from %s", (selection, expected) => {
    expect(pronunciationWord(selection)).toBe(expected);
  });

  it("replaces queued speech and reads the selected word in US English", () => {
    const cancel = vi.fn();
    const speak = vi.fn();
    const runtime = {
      speechSynthesis: { cancel, speak },
      SpeechSynthesisUtterance: MockUtterance as unknown as typeof SpeechSynthesisUtterance,
    };

    expect(canSpeakWord(runtime)).toBe(true);
    expect(speakEnglishWord("“quality”", runtime)).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(speak).toHaveBeenCalledOnce();
    expect(speak.mock.calls[0][0]).toMatchObject({ text: "quality", lang: "en-US", rate: 0.86 });
  });

  it("fails quietly when browser speech is unavailable", () => {
    expect(canSpeakWord({})).toBe(false);
    expect(speakEnglishWord("quality", {})).toBe(false);
  });
});
