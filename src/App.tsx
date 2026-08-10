import { useEffect, useState } from "react";
import { LexTale } from "./components/LexTale";
import { Library, type BookSource } from "./components/Library";
import { Reader } from "./components/Reader";
import { loadProfile, saveProfile, type ReaderProfile } from "./lib/storage";

type Screen = "calibrate" | "library" | "reader";

export default function App() {
  const [profile, setProfile] = useState<ReaderProfile>({ score: null, band: "未校准 · 平衡辅助", preset: "balanced" });
  const [screen, setScreen] = useState<Screen>("calibrate");
  const [source, setSource] = useState<BookSource | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const existing = loadProfile();
    if (existing) {
      setProfile(existing);
      setScreen("library");
    }
    setReady(true);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [screen]);

  function completeCalibration(next: ReaderProfile) {
    saveProfile(next);
    setProfile(next);
    setScreen("library");
  }

  function skipCalibration() {
    const next: ReaderProfile = { score: null, band: "未校准 · 平衡辅助", preset: "balanced" };
    saveProfile(next);
    setProfile(next);
    setScreen("library");
  }

  function changeProfile(next: ReaderProfile) {
    saveProfile(next);
    setProfile(next);
  }

  if (!ready) return null;
  if (screen === "calibrate") return <LexTale onComplete={completeCalibration} onSkip={skipCalibration} />;
  if (screen === "reader" && source) return <Reader source={source} profile={profile} onClose={() => setScreen("library")} />;
  return <Library profile={profile} onProfileChange={changeProfile} onRetest={() => setScreen("calibrate")} onOpen={(book) => { setSource(book); setScreen("reader"); }} />;
}
