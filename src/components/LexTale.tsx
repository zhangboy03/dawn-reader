import { useEffect, useState } from "react";
import { LEXTALE_ITEMS, profileForScore, scoreLexTale } from "../lib/lextale";
import type { ReaderProfile } from "../lib/storage";

export function LexTale({ onComplete, onSkip }: { onComplete: (profile: ReaderProfile) => void; onSkip: () => void }) {
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [result, setResult] = useState<ReaderProfile | null>(null);

  function answer(value: boolean) {
    const next = [...answers, value];
    if (index === LEXTALE_ITEMS.length - 1) {
      const score = scoreLexTale(next);
      const profile = profileForScore(score);
      setResult({ score, band: profile.band, preset: profile.preset });
    } else {
      setAnswers(next);
      setIndex((current) => current + 1);
    }
  }

  useEffect(() => {
    if (!started || result) return;
    const listener = (event: KeyboardEvent) => {
      if (event.key === "1" || event.key.toLowerCase() === "y") answer(true);
      if (event.key === "2" || event.key.toLowerCase() === "n") answer(false);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  });

  if (result) {
    const detail = profileForScore(result.score ?? 0);
    return <main className="onboarding result-screen">
      <div className="eyebrow">校准完成</div>
      <div className="score-dial" aria-label={`LexTALE ${result.score}分`}>
        <span>{result.score}</span><small>/ 100</small>
      </div>
      <h1>你的起点：{result.band}</h1>
      <p className="lede">{detail.summary}</p>
      <div className="notice">这只是阅读辅助的初始旋钮，不是英语证书。读完每章后的真实理解感受，会比一次测试更重要。</div>
      <button className="primary" onClick={() => onComplete(result)}>进入书架 <span>→</span></button>
    </main>;
  }

  if (started) {
    const progress = ((index + 1) / LEXTALE_ITEMS.length) * 100;
    return <main className="test-screen">
      <header className="test-header">
        <button className="wordmark" onClick={onSkip}>Dawn Reader</button>
        <span>{index + 1} / {LEXTALE_ITEMS.length}</span>
      </header>
      <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
      <section className="word-test">
        <div className="eyebrow">这个英文单词真实存在吗？</div>
        <div className="test-word">{LEXTALE_ITEMS[index].item}</div>
        <p>凭第一感觉判断，不需要赶时间，也不要查词典。</p>
        <div className="answer-row">
          <button onClick={() => answer(true)}><kbd>1</kbd><strong>是真词</strong><span>YES</span></button>
          <button onClick={() => answer(false)}><kbd>2</kbd><strong>不像真词</strong><span>NO</span></button>
        </div>
      </section>
    </main>;
  }

  return <main className="onboarding">
    <div className="sunrise-mark" aria-hidden="true"><i /></div>
    <div className="eyebrow">五分钟，找到合适的辅助力度</div>
    <h1>先校准，<em>再上路。</em></h1>
    <p className="lede">用 63 个真假词快速估计你读英文原著时需要多少帮助。它不会决定你能读什么书，只决定求助按钮的力度。</p>
    <div className="calibration-card">
      <div><strong>看一个词</strong><small>不查词典</small></div>
      <div><strong>凭直觉判断</strong><small>约 3.5 分钟</small></div>
      <div><strong>得到辅助档位</strong><small>随后随阅读调整</small></div>
    </div>
    <div className="onboarding-actions">
      <button className="primary" onClick={() => setStarted(true)}>开始词汇校准 <span>→</span></button>
      <button className="text-button" onClick={onSkip}>先跳过，直接试读</button>
    </div>
    <p className="fine-print">LexTALE / 3 个练习项 + 60 个计分项 / British spelling</p>
  </main>;
}
