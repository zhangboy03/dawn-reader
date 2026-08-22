import { useEffect, useMemo, useState } from "react";
import {
  listAiPerformanceEvents,
  subscribeAiPerformance,
  summarizeAiPerformance,
  type AiPerformanceEvent,
  type AiPerformancePeriod,
} from "../lib/aiPerformance";
import {
  deleteReadingEvidence,
  listReadingEvidence,
  listReadingTimeSlices,
  subscribeReadingEvidence,
  summarizeReadingTime,
  type ReadingEvidenceRecord,
} from "../lib/readingEvidence";

type HistoryFilter = "all" | "words" | "sentences";

function formatMinutes(milliseconds: number) {
  if (milliseconds <= 0) return "0 分钟";
  if (milliseconds < 60_000) return "<1 分钟";
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} 小时 ${remainder} 分钟` : `${hours} 小时`;
}

function formatDuration(milliseconds: number | null) {
  if (milliseconds == null) return "—";
  return milliseconds < 1000 ? `${Math.round(milliseconds)} ms` : `${(milliseconds / 1000).toFixed(2)} s`;
}

const periodLabels: Record<AiPerformancePeriod, string> = {
  morning: "早上 07–12",
  afternoon: "下午 12–19",
  evening: "晚上 19–24",
  overnight: "凌晨 00–07",
};

function recordMatchesFilter(record: ReadingEvidenceRecord, filter: HistoryFilter) {
  if (filter === "all") return true;
  if (filter === "words") return record.kind === "word" || record.kind === "phrase";
  return record.kind === "passage";
}

export function ReadingHistory({
  onClose,
  onOpenSource,
}: {
  onClose: () => void;
  onOpenSource: (record: ReadingEvidenceRecord) => void | Promise<void>;
}) {
  const [records, setRecords] = useState<ReadingEvidenceRecord[]>([]);
  const [aiEvents, setAiEvents] = useState<AiPerformanceEvent[]>([]);
  const [timeSummary, setTimeSummary] = useState({ todayMs: 0, weekMs: 0 });
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const [nextRecords, slices, nextAiEvents] = await Promise.all([
        listReadingEvidence().catch(() => []),
        listReadingTimeSlices().catch(() => []),
        listAiPerformanceEvents(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)).catch(() => []),
      ]);
      if (cancelled) return;
      setRecords(nextRecords);
      setAiEvents(nextAiEvents);
      setTimeSummary(summarizeReadingTime(slices));
    };
    void refresh();
    const unsubscribeEvidence = subscribeReadingEvidence(() => { void refresh(); });
    const unsubscribePerformance = subscribeAiPerformance(() => { void refresh(); });
    return () => {
      cancelled = true;
      unsubscribeEvidence();
      unsubscribePerformance();
    };
  }, []);

  const aiSummary = useMemo(() => summarizeAiPerformance(aiEvents), [aiEvents]);

  function exportAiPerformance() {
    const data = JSON.stringify({ exportedAt: new Date().toISOString(), events: aiEvents }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `dawn-pdf-ai-performance-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  const visibleRecords = useMemo(() => {
    const normalizedQuery = query.normalize("NFKC").toLocaleLowerCase().trim();
    return records.filter((record) => {
      if (!recordMatchesFilter(record, filter)) return false;
      if (!normalizedQuery) return true;
      const searchable = `${record.selectedText} ${record.sentenceText} ${record.bookTitle} ${record.explanations.map((item) => item.text).join(" ")}`
        .normalize("NFKC")
        .toLocaleLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [records, filter, query]);

  return <main className="reading-history-shell">
    <header className="reading-history-topbar">
      <button type="button" onClick={onClose}>← <span>书架</span></button>
      <div><small>READING EVIDENCE</small><strong>查阅记录</strong></div>
    </header>

    <section className="reading-history-summary" aria-label="阅读时间（估算）">
      <div><small>今天</small><strong>{formatMinutes(timeSummary.todayMs)}</strong></div>
      <div><small>过去 7 天</small><strong>{formatMinutes(timeSummary.weekMs)}</strong></div>
    </section>

    <section className="ai-performance-summary" aria-label="PDF AI 性能（仅本机）">
      <header>
        <div><small>PDF AI · 仅本机</small><strong>过去 7 天</strong></div>
        <button type="button" disabled={!aiEvents.length} onClick={exportAiPerformance}>导出 JSON</button>
      </header>
      {aiSummary.count ? <>
        <div className="ai-performance-totals">
          <div><small>请求</small><strong>{aiSummary.count}</strong></div>
          <div><small>p50</small><strong>{formatDuration(aiSummary.p50Ms)}</strong></div>
          <div><small>p95</small><strong>{formatDuration(aiSummary.p95Ms)}</strong></div>
          <div><small>成功率</small><strong>{aiSummary.successRate == null ? "—" : `${(aiSummary.successRate * 100).toFixed(1)}%`}</strong></div>
        </div>
        <div className="ai-performance-periods">
          {(Object.keys(periodLabels) as AiPerformancePeriod[]).map((period) => {
            const summary = aiSummary.byPeriod[period];
            return <div key={period}>
              <span>{periodLabels[period]}</span>
              <strong>{formatDuration(summary.p50Ms)}</strong>
              <small>p95 {formatDuration(summary.p95Ms)} · n={summary.count}</small>
            </div>;
          })}
        </div>
        <footer>
          <span>Worker p50 {formatDuration(aiSummary.workerP50Ms)}</span>
          <span>Gemini p50 {formatDuration(aiSummary.providerP50Ms)}</span>
          <span>Colo {aiSummary.colos.slice(0, 3).map((item) => `${item.colo} ${item.count}`).join(" · ") || "—"}</span>
        </footer>
      </> : <p>从下一次 PDF“简明英文”开始记录；不保存论文原文或回答。</p>}
    </section>

    <section className="reading-history-controls">
      <div role="group" aria-label="筛选查阅记录">
        {(["all", "words", "sentences"] as const).map((value) => <button
          type="button"
          key={value}
          className={filter === value ? "active" : ""}
          aria-pressed={filter === value}
          onClick={() => setFilter(value)}
        >{{ all: "全部", words: "词语", sentences: "句段" }[value]}</button>)}
      </div>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="搜索原文或解释"
        aria-label="搜索查阅记录"
      />
    </section>

    <section className="reading-evidence-ledger" aria-live="polite">
      {visibleRecords.map((record) => {
        const latest = record.explanations.at(-1);
        return <article className="reading-evidence-entry" key={record.id}>
          <div className="evidence-entry-meta">
            <span>{record.kind === "word" ? "WORD" : record.kind === "phrase" ? "PHRASE" : "PASSAGE"}</span>
            <span>{record.bookTitle}</span>
            <time dateTime={record.updatedAt}>{new Date(record.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
          </div>
          <h2>{record.selectedText}</h2>
          {record.sentenceText && record.sentenceText !== record.selectedText && <blockquote>{record.sentenceText}</blockquote>}
          <div className="evidence-explanations">
            {record.explanations.map((explanation) => <div key={explanation.id}>
              <small>{explanation.mode === "chinese" ? "中文详解" : explanation.mode === "chat" ? explanation.question || "AI 回答" : "英文释义"}</small>
              <p>{explanation.text}</p>
              {explanation.provider && <em>{explanation.provider}</em>}
            </div>)}
          </div>
          <footer>
            <button type="button" disabled={!record.anchor.cfi || !record.bookId} onClick={() => void onOpenSource(record)}>回到原文</button>
            <button type="button" className="evidence-delete" onClick={() => void deleteReadingEvidence(record.id)}>删除</button>
          </footer>
        </article>;
      })}
      {!visibleRecords.length && <div className="reading-evidence-empty">
        <h2>{records.length ? "没有匹配的记录" : "还没有查阅记录"}</h2>
        <p>{records.length ? "换一个关键词或筛选条件试试。" : "划过的词句、所在原句和完整解释会显示在这里。"}</p>
      </div>}
    </section>
  </main>;
}
