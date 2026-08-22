"use client";

import "./readingEvidence.css";
import "./selection/autoInstallReadingSelection";

import { lazy, Suspense, useEffect, useState } from "react";
import { LexTale } from "./components/LexTale";
import { Library, type PublicationSource } from "./components/Library";
import { ReadingHistory } from "./components/ReadingHistory";
import { Reader } from "./components/Reader";
import { listStoredBooks, storedBookFile } from "./lib/bookStore";
import { loadCloudState, saveCloudState } from "./lib/cloudSync";
import { type ReadingEvidenceRecord } from "./lib/readingEvidence";
import { saveReaderSettings } from "./lib/readerSettings";
import { parseReadingPosition } from "./lib/readingPosition";
import { loadProfile, saveProfile, type ReaderProfile } from "./lib/storage";
import {
  configureClientAccountContext,
  readerLocalStorage,
  type ClientAccountContext,
} from "./lib/clientAccountContext";
import {
  claimLegacyLocalData,
  inspectLegacyLocalData,
  leaveLegacyLocalDataQuarantined,
  legacyLocalDataDecision,
  type LegacyLocalDataSummary,
} from "./lib/legacyLocalData";

const PdfReader = lazy(() => import("./components/pdf/PdfReader").then((module) => ({ default: module.PdfReader })));

type Screen = "calibrate" | "library" | "reader" | "history";
type LegacyGateState = "checking" | "available" | "importing" | "ready";

export default function App({ accountContext }: { accountContext: ClientAccountContext }) {
  configureClientAccountContext(accountContext);
  const [profile, setProfile] = useState<ReaderProfile>({ score: null, band: "未校准 · 平衡辅助", preset: "balanced" });
  const [screen, setScreen] = useState<Screen>("calibrate");
  const [source, setSource] = useState<PublicationSource | null>(null);
  const [ready, setReady] = useState(false);
  const [legacyGate, setLegacyGate] = useState<LegacyGateState>(
    accountContext.canClaimLegacyLocalData ? "checking" : "ready",
  );
  const [legacySummary, setLegacySummary] = useState<LegacyLocalDataSummary | null>(null);
  const [legacyError, setLegacyError] = useState("");

  useEffect(() => {
    if (!accountContext.canClaimLegacyLocalData || legacyLocalDataDecision()) {
      setLegacyGate("ready");
      return;
    }
    let cancelled = false;
    void inspectLegacyLocalData().then((summary) => {
      if (cancelled) return;
      setLegacySummary(summary);
      setLegacyGate(summary.books || summary.evidence || summary.localStorageKeys ? "available" : "ready");
    }).catch(() => {
      if (!cancelled) {
        setLegacyError("暂时无法检查旧资料。它们仍保留在原位置，没有被删除或上传。");
        setLegacyGate("available");
      }
    });
    return () => { cancelled = true; };
  }, [accountContext.canClaimLegacyLocalData]);

  useEffect(() => {
    if (legacyGate !== "ready") return;
    let cancelled = false;
    const existing = loadProfile();
    if (existing) {
      setProfile(existing);
      setScreen("library");
    }
    setReady(true);
    void loadCloudState().then((cloud) => {
      if (cancelled) return;
      if (cloud.profile) {
        saveProfile(cloud.profile);
        setProfile(cloud.profile);
        setScreen("library");
      }
      if (cloud.settings) saveReaderSettings(cloud.settings);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [legacyGate]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [screen]);

  function completeCalibration(next: ReaderProfile) {
    saveProfile(next);
    void saveCloudState({ profile: next }).catch(() => undefined);
    setProfile(next);
    setScreen("library");
  }

  function skipCalibration() {
    const next: ReaderProfile = { score: null, band: "未校准 · 平衡辅助", preset: "balanced" };
    saveProfile(next);
    void saveCloudState({ profile: next }).catch(() => undefined);
    setProfile(next);
    setScreen("library");
  }

  function changeProfile(next: ReaderProfile) {
    saveProfile(next);
    void saveCloudState({ profile: next }).catch(() => undefined);
    setProfile(next);
  }

  async function openHistoryRecord(record: ReadingEvidenceRecord) {
    if (!record.bookId) return;
    const book = (await listStoredBooks().catch(() => [])).find((candidate) => candidate.id === record.bookId) ?? null;
    if (!book?.blob) {
      window.alert("这本书当前不在本机书架中，暂时无法回到原文。");
      return;
    }
    const returnPosition = parseReadingPosition(readerLocalStorage().getItem(`dawn-reader-progress:${record.bookId}`));
    setSource({
      type: "epub",
      id: record.bookId,
      title: book.title,
      file: storedBookFile(book),
      assistantMode: "rewrite",
      initialCfi: record.anchor.cfi,
      referenceReturnCfi: returnPosition?.cfi ?? null,
      returnToHistory: true,
    });
    setScreen("reader");
  }

  async function importLegacyData() {
    setLegacyError("");
    setLegacyGate("importing");
    try {
      await claimLegacyLocalData();
      window.location.reload();
    } catch {
      setLegacyError("导入没有完成。旧资料仍保持原样；Dawn 没有上传或删除它们。");
      setLegacyGate("available");
    }
  }

  function keepLegacyDataQuarantined() {
    leaveLegacyLocalDataQuarantined();
    setLegacyGate("ready");
  }

  if (legacyGate === "checking") return null;
  if (legacyGate === "available" || legacyGate === "importing") {
    const count = (legacySummary?.books ?? 0) + (legacySummary?.evidence ?? 0);
    return (
      <main className="legacy-data-gate">
        <section className="legacy-data-card" aria-labelledby="legacy-data-title">
          <p className="legacy-data-eyebrow">本机资料迁移</p>
          <h1 id="legacy-data-title">这台浏览器里有旧版 Dawn 资料</h1>
          <p>
            为了防止不同账号看到或上传彼此的书籍与阅读记录，Dawn 已先把旧资料隔离。
            你可以明确把它们导入当前账号的本机空间，或暂时保持隔离。
          </p>
          {count > 0 && <p className="legacy-data-summary">检测到约 {count} 条本机书籍或阅读记录。</p>}
          <p className="legacy-data-note">导入只在这台浏览器内复制，不会自动上传 EPUB、PDF 或阅读进度。</p>
          {legacyError && <p className="legacy-data-error" role="alert">{legacyError}</p>}
          <div className="legacy-data-actions">
            <button type="button" onClick={() => void importLegacyData()} disabled={legacyGate === "importing"}>
              {legacyGate === "importing" ? "正在安全导入…" : "导入到当前账号"}
            </button>
            <button type="button" className="secondary" onClick={keepLegacyDataQuarantined} disabled={legacyGate === "importing"}>
              保持隔离，进入空白本机书架
            </button>
          </div>
        </section>
      </main>
    );
  }
  if (!ready) return null;
  if (screen === "calibrate") return <LexTale onComplete={completeCalibration} onSkip={skipCalibration} />;
  if (screen === "history") return <ReadingHistory onClose={() => setScreen("library")} onOpenSource={openHistoryRecord} />;
  if (screen === "reader" && source) {
    if (source.type === "pdf") return <Suspense fallback={<main className="pdf-shell-loading">正在打开 PDF…</main>}><PdfReader source={source} profile={profile} onClose={() => setScreen("library")} /></Suspense>;
    return <Reader source={source} profile={profile} onClose={() => setScreen(source.returnToHistory ? "history" : "library")} />;
  }
  return <Library
    profile={profile}
    role={accountContext.role}
    authKind={accountContext.authKind}
    onProfileChange={changeProfile}
    onRetest={() => setScreen("calibrate")}
    onOpenHistory={() => setScreen("history")}
    onOpen={(book) => { setSource(book); setScreen("reader"); }}
  />;
}
