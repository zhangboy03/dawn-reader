import { useEffect, useMemo, useState } from "react";
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
  const [timeSummary, setTimeSummary] = useState({ todayMs: 0, weekMs: 0 });
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const [nextRecords, slices] = await Promise.all([
        listReadingEvidence().catch(() => []),
        listReadingTimeSlices().catch(() => []),
      ]);
      if (cancelled) return;
      setRecords(nextRecords);
      setTimeSummary(summarizeReadingTime(slices));
    };
    void refresh();
    const unsubscribe = subscribeReadingEvidence(() => { void refresh(); });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

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
      <p>解释完整显示 1 秒后自动保存</p>
    </header>

    <section className="reading-history-summary" aria-label="阅读时间（估算）">
      <div><small>今天</small><strong>{formatMinutes(timeSummary.todayMs)}</strong></div>
      <div><small>过去 7 天</small><strong>{formatMinutes(timeSummary.weekMs)}</strong></div>
      <p>只统计阅读器在前台、且最近有翻页、划词或提问的时间；不代表理解程度。</p>
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
        <h2>{records.length ? "没有匹配的记录" : "划词后，解释会自动来到这里"}</h2>
        <p>{records.length ? "换一个关键词或筛选条件试试。" : "完整解释在屏幕上停留约 1 秒，就会连同所在句子一起保存。"}</p>
      </div>}
    </section>
  </main>;
}
