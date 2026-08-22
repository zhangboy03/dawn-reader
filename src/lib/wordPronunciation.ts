const ENGLISH_WORD = /[\p{L}\p{N}]+(?:['’\u2010-\u2015-][\p{L}\p{N}]+)*/u;

type SpeechRuntime = {
  speechSynthesis?: Pick<SpeechSynthesis, "cancel" | "speak">;
  SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance;
};

// Kept dormant so the browser voice can return only as an explicit experiment.
export function wordPronunciationExperimentEnabled() {
  return false;
}

export function pronunciationWord(selection: string) {
  return selection.trim().match(ENGLISH_WORD)?.[0] ?? "";
}

export function canSpeakWord(runtime: SpeechRuntime = globalThis) {
  return Boolean(runtime.speechSynthesis && runtime.SpeechSynthesisUtterance);
}

export function speakEnglishWord(selection: string, runtime: SpeechRuntime = globalThis) {
  const word = pronunciationWord(selection);
  const SynthUtterance = runtime.SpeechSynthesisUtterance;
  const synth = runtime.speechSynthesis;
  if (!word || !SynthUtterance || !synth) return false;

  const utterance = new SynthUtterance(word);
  utterance.lang = "en-US";
  utterance.rate = 0.86;
  synth.cancel();
  synth.speak(utterance);
  return true;
}
