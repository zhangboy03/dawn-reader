import { useCallback, useEffect, useRef, useState } from "react";
import type { ReaderProfile } from "../lib/storage";
import {
  cacheStoredBook,
  deleteStoredBook,
  listStoredBooks,
  saveEpub,
  storedBookFile,
  type StoredBook,
} from "../lib/bookStore";
import { deleteBookRemoteFirst, deletedBookIds, forgetDeletedBook, rememberDeletedBook } from "../lib/bookDeletion";
import {
  deleteCloudBook,
  downloadCloudBook,
  loadCloudLibrary,
  saveCloudProgress,
  uploadCloudBook,
  type CloudBook,
} from "../lib/cloudSync";
import { parseReadingPosition } from "../lib/readingPosition";
import { DeviceSync } from "./DeviceSync";

export type BookSource = { type: "text"; title: string; text: string } | { type: "epub"; id?: string; title: string; file: File };

type AiHealth = {
  provider: string;
  model: string | null;
  configured: boolean;
  pendingProvider: string | null;
};

type ShelfBook = StoredBook & {
  synced: boolean;
  cloud?: CloudBook;
};

type SyncState = "loading" | "syncing" | "ready" | "local";

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
        const data = await response.json().catch(() => null) as { error?: string } | null;
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

function mergeShelf(local: StoredBook[], cloud: CloudBook[]): ShelfBook[] {
  const localById = new Map(local.map((book) => [book.id, book]));
  const merged: ShelfBook[] = cloud.map((book) => ({
    ...(localById.get(book.id) ?? {
      id: book.id,
      title: book.title,
      fileName: book.fileName,
      blob: null,
      addedAt: book.addedAt,
    }),
    title: book.title,
    fileName: book.fileName,
    synced: true,
    cloud: book,
  }));
  for (const book of local) {
    if (!cloud.some((remote) => remote.id === book.id)) merged.push({ ...book, synced: false });
  }
  return merged.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

export function Library({ profile, onOpen, onRetest, onProfileChange }: {
  profile: ReaderProfile;
  onOpen: (source: BookSource) => void;
  onRetest: () => void;
  onProfileChange: (profile: ReaderProfile) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [storedBooks, setStoredBooks] = useState<ShelfBook[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>("loading");
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function syncLibrary() {
      const tombstones = deletedBookIds();
      const allLocal = await listStoredBooks().catch(() => []);
      const local = allLocal.filter((book) => !tombstones.has(book.id));
      if (cancelled) return;
      setStoredBooks(local.map((book) => ({ ...book, synced: false })));
      try {
        const cloudLibrary = await loadCloudLibrary();
        const allCloud = cloudLibrary.books;
        const deletionDates = new Map((cloudLibrary.deletedBooks ?? []).map((item) => [item.id, item.deletedAt]));
        const staleServerDeletedIds = new Set(allLocal.filter((book) => {
          const deletedAt = deletionDates.get(book.id);
          return deletedAt ? book.addedAt <= deletedAt : false;
        }).map((book) => book.id));
        const deletedEverywhere = new Set([...tombstones, ...staleServerDeletedIds]);
        for (const book of allLocal.filter((candidate) => staleServerDeletedIds.has(candidate.id))) {
          rememberDeletedBook(book.id);
          await deleteStoredBook(book.id).catch(() => undefined);
        }
        const visibleLocal = local.filter((book) => !deletedEverywhere.has(book.id));
        const cloud = allCloud.filter((book) => !deletedEverywhere.has(book.id));
        for (const book of allCloud.filter((candidate) => tombstones.has(candidate.id))) {
          await deleteCloudBook(book.id);
          await deleteStoredBook(book.id).catch(() => undefined);
        }
        if (cancelled) return;
        setStoredBooks(mergeShelf(visibleLocal, cloud));
        const unsynced = visibleLocal.filter((book) => !cloud.some((remote) => remote.id === book.id));
        if (unsynced.length) {
          setSyncState("syncing");
          for (const book of unsynced) {
            await uploadCloudBook(book);
            const localPosition = parseReadingPosition(localStorage.getItem(`dawn-reader-progress:${book.id}`));
            if (localPosition) await saveCloudProgress(book.id, localPosition);
          }
          const refreshed = await loadCloudLibrary();
          if (!cancelled) setStoredBooks(mergeShelf(visibleLocal, refreshed.books));
        }
        if (!cancelled) setSyncState("ready");
      } catch {
        if (!cancelled) setSyncState("local");
      }
    }
    void syncLibrary();
    return () => { cancelled = true; };
  }, []);

  async function importFile(file?: File) {
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension === "epub") {
      const stored = await saveEpub(file);
      forgetDeletedBook(stored.id);
      setStoredBooks((books) => [{ ...stored, synced: false }, ...books.filter((book) => book.id !== stored.id)]);
      setSyncState("syncing");
      try {
        await uploadCloudBook(stored);
        setStoredBooks((books) => books.map((book) => book.id === stored.id ? { ...book, synced: true } : book));
        setSyncState("ready");
      } catch {
        setSyncState("local");
      }
      return onOpen({ type: "epub", id: stored.id, title: stored.title, file });
    }
    if (["txt", "md", "markdown"].includes(extension ?? "")) {
      return onOpen({ type: "text", title: file.name.replace(/\.(txt|md|markdown)$/i, ""), text: await file.text() });
    }
    window.alert("第一版支持 EPUB、TXT、MD 和 Markdown 文件。");
  }

  async function openBook(book: ShelfBook) {
    if (openingId) return;
    setOpeningId(book.id);
    try {
      let file: File;
      if (book.blob) {
        file = storedBookFile(book);
      } else if (book.cloud) {
        file = await downloadCloudBook(book.cloud);
        await cacheStoredBook(book, file);
      } else {
        throw new Error("这本书尚未同步到当前设备。");
      }
      onOpen({ type: "epub", id: book.id, title: book.title, file });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "打开失败");
      setOpeningId(null);
    }
  }

  async function removeBook(book: ShelfBook) {
    if (deletingId || !window.confirm(`从书架删除《${book.title}》？\n\n电子书文件和阅读进度会从已同步设备中移除。`)) return;
    setDeletingId(book.id);
    try {
      await deleteBookRemoteFirst({
        bookId: book.id,
        synced: book.synced,
        deleteRemote: () => deleteCloudBook(book.id),
        deleteLocal: () => deleteStoredBook(book.id),
      });
      setStoredBooks((books) => books.filter((candidate) => candidate.id !== book.id));
    } catch (error) {
      if (deletedBookIds().has(book.id)) {
        setStoredBooks((books) => books.filter((candidate) => candidate.id !== book.id));
        window.alert("云端已删除；本机缓存将在下次打开时继续清理。");
      } else {
        window.alert(error instanceof Error ? error.message : "删除失败，请稍后重试。");
      }
    } finally {
      setDeletingId(null);
    }
  }

  const syncLabel = {
    loading: "连接中",
    syncing: "同步中",
    ready: "已同步",
    local: "仅本机",
  }[syncState];

  return <main className="library-shell">
    <header className="topbar">
      <div className="brand-lockup"><div className="brand">Dawn Reader</div><span className={`sync-mark ${syncState}`}>{syncLabel}</span></div>
      <div className="topbar-actions">
        <DeviceSync />
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
          {storedBooks.map((book) => <article className="stored-book" key={book.id}>
            <button className="book-open" disabled={openingId === book.id || deletingId === book.id} onClick={() => void openBook(book)}>
              <div className="stored-spine" aria-hidden="true"><span>{book.synced ? "CLOUD EPUB" : "LOCAL EPUB"}</span><strong>{book.title.slice(0, 2).toUpperCase()}</strong><i /></div>
              <div><small>EPUB · {book.synced ? "云端" : "本机"}</small><h3>{book.title}</h3><strong>{openingId === book.id ? "正在打开…" : deletingId === book.id ? "正在删除…" : "继续阅读"} <span>→</span></strong></div>
            </button>
            <details className="book-menu">
              <summary aria-label={`管理《${book.title}》`}>•••</summary>
              <div><button className="danger" onClick={() => void removeBook(book)}>从书架删除</button></div>
            </details>
          </article>)}
        </div>
      </>}
    </section>
  </main>;
}
