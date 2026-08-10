import { useCallback, useEffect, useRef, useState } from "react";
import type { ReaderProfile } from "../lib/storage";
import { listStoredBooks, saveEpub, storedBookFile, type StoredBook } from "../lib/bookStore";

export type BookSource = { type: "text"; title: string; text: string } | { type: "epub"; id?: string; title: string; file: File };

type AiHealth = {
  provider: string;
  model: string | null;
  configured: boolean;
  pendingProvider: string | null;
};

function AiStatus() {
  const [health, setHealth] = useState<AiHealth | null>(null);
  const [testState, setTestState] = useState<"idle" | "testing" | "passed" | "failed">("idle");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/health");
      if (!response.ok) throw new Error("状态检查失败");
      setHealth(await response.json());
    } catch {
      setHealth({ provider: "offline-demo", model: null, configured: false, pendingProvider: "deepseek" });
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function testConnection() {
    setTestState("testing");
    setMessage("");
    const started = performance.now();
    try {
      const response = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "The point was difficult to grasp.", preset: "balanced" }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "连接失败");
      }
      await response.text();
      const provider = response.headers.get("X-AI-Provider") ?? "AI";
      if (provider === "offline-demo") throw new Error("AI_API_KEY 尚未填写");
      setTestState("passed");
      setMessage(`${Math.round(performance.now() - started)} ms · ${provider.replace(" | ", " · ")}`);
      await refresh();
    } catch (error) {
      setTestState("failed");
      setMessage(error instanceof Error ? error.message : "连接失败");
    }
  }

  const waitingForKey = !health?.configured && health?.pendingProvider === "deepseek";
  return <aside className={`ai-status ${testState === "passed" ? "verified" : ""}`} aria-label="AI 连接状态">
    <div><strong>AI</strong><span>{message || (waitingForKey ? "等待 API 密钥" : health?.model ? `${health.provider} · ${health.model}` : "离线")}</span></div>
    <button disabled={!health?.configured || testState === "testing"} onClick={testConnection}>
      {testState === "testing" ? "测试中…" : testState === "passed" ? "重测" : "测试"}
    </button>
  </aside>;
}

export function Library({ profile, onOpen, onRetest, onProfileChange }: {
  profile: ReaderProfile;
  onOpen: (source: BookSource) => void;
  onRetest: () => void;
  onProfileChange: (profile: ReaderProfile) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [storedBooks, setStoredBooks] = useState<StoredBook[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    listStoredBooks().then(setStoredBooks).catch(() => setStoredBooks([]));
  }, []);

  async function importFile(file?: File) {
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension === "epub") {
      const stored = await saveEpub(file);
      setStoredBooks((books) => [stored, ...books.filter((book) => book.id !== stored.id)]);
      return onOpen({ type: "epub", id: stored.id, title: stored.title, file });
    }
    if (["txt", "md", "markdown"].includes(extension ?? "")) {
      return onOpen({ type: "text", title: file.name.replace(/\.(txt|md|markdown)$/i, ""), text: await file.text() });
    }
    window.alert("第一版支持 EPUB、TXT、MD 和 Markdown 文件。");
  }

  return <main className="library-shell">
    <header className="topbar">
      <div className="brand">Dawn Reader</div>
      <div className="profile-control">
        <button className="profile-chip" onClick={() => setProfileOpen((open) => !open)}><i /> {profile.band}</button>
        {profileOpen && <div className="profile-menu">
          <small>阅读辅助档位</small>
          <button onClick={() => { onProfileChange({ score: null, band: "B1 · 支持模式", preset: "supportive" }); setProfileOpen(false); }}><strong>B1</strong><span>更多短释义与拆句</span></button>
          <button className={profile.preset === "balanced" ? "active" : ""} onClick={() => { onProfileChange({ score: null, band: "B2 · 平衡模式", preset: "balanced" }); setProfileOpen(false); }}><strong>B2</strong><span>原文优先，卡住才帮</span></button>
          <button onClick={() => { onProfileChange({ score: null, band: "C1+ · 轻量模式", preset: "light" }); setProfileOpen(false); }}><strong>C1+</strong><span>只处理低频词与长句</span></button>
          <button className="retest-link" onClick={onRetest}>重新做 LexTALE →</button>
        </div>}
      </div>
    </header>
    <section className="library-hero">
      <div className="hero-copy">
        <h1>书架</h1>
        <div className="library-actions">
          <button className="primary" onClick={() => fileRef.current?.click()}>导入 <span>＋</span></button>
          <input ref={fileRef} hidden type="file" accept=".epub,.txt,.md,.markdown" onChange={(event) => importFile(event.target.files?.[0])} />
        </div>
      </div>
      <AiStatus />
    </section>
    <section className="shelf">
      {storedBooks.length > 0 && <>
        <div className="section-heading"><h2>继续阅读</h2></div>
        <div className="stored-shelf">
          {storedBooks.map((book) => <button className="stored-book" key={book.id} onClick={() => onOpen({ type: "epub", id: book.id, title: book.title, file: storedBookFile(book) })}>
            <div className="stored-spine" aria-hidden="true"><span>LOCAL EPUB</span><strong>{book.title.slice(0, 2).toUpperCase()}</strong><i /></div>
            <div><small>EPUB</small><h3>{book.title}</h3><strong>打开 <span>→</span></strong></div>
          </button>)}
        </div>
      </>}
    </section>
  </main>;
}
