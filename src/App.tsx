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

const PdfReader = lazy(() => import("./components/pdf/PdfReader").then((module) => ({ default: module.PdfReader })));

type Screen = "calibrate" | "library" | "reader" | "history";

export default function App() {
  const [profile, setProfile] = useState<ReaderProfile>({ score: null, band: "未校准 · 平衡辅助", preset: "balanced" });
  const [screen, setScreen] = useState<Screen>("calibrate");
  const [source, setSource] = useState<PublicationSource | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
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
      } else if (existing) {
        void saveCloudState({ profile: existing }).catch(() => undefined);
      }
      if (cloud.settings) saveReaderSettings(cloud.settings);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

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
    const returnPosition = parseReadingPosition(localStorage.getItem(`dawn-reader-progress:${record.bookId}`));
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

  if (!ready) return null;
  if (screen === "calibrate") return <LexTale onComplete={completeCalibration} onSkip={skipCalibration} />;
  if (screen === "history") return <ReadingHistory onClose={() => setScreen("library")} onOpenSource={openHistoryRecord} />;
  if (screen === "reader" && source) {
    if (source.type === "pdf") return <Suspense fallback={<main className="pdf-shell-loading">正在打开 PDF…</main>}><PdfReader source={source} profile={profile} onClose={() => setScreen("library")} /></Suspense>;
    return <Reader source={source} profile={profile} onClose={() => setScreen(source.returnToHistory ? "history" : "library")} />;
  }
  return <Library
    profile={profile}
    onProfileChange={changeProfile}
    onRetest={() => setScreen("calibrate")}
    onOpenHistory={() => setScreen("history")}
    onOpen={(book) => { setSource(book); setScreen("reader"); }}
  />;
}
