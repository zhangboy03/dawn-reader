import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { ReaderProfile } from "../lib/storage";
import {
  cacheStoredBook,
  deleteStoredBook,
  hydrateStoredBookPresentation,
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
import {
  loadBookAssistantModes,
  saveBookAssistantMode,
  type BookAssistantMode,
} from "../lib/bookAssistantMode";
import { DeviceSync } from "./DeviceSync";

export type BookSource = (
  { type: "text"; title: string; text: string }
  | { type: "epub"; id?: string; title: string; file: File }
) & {
  assistantMode: BookAssistantMode;
  initialCfi?: string | null;
  referenceReturnCfi?: string | null;
  returnToHistory?: boolean;
};

type AiHealth = {
  provider: string;
  model: string | null;
  configured: boolean;
  pendingProvider: string | null;
  searchConfigured?: boolean;
};

type ShelfBook = StoredBook & {
  synced: boolean;
  cloud?: CloudBook;
};

type SyncState = "loading" | "syncing" | "ready" | "local";

const assistantModePresentation: Record<BookAssistantMode, { title: string; description: string; mark: string }> = {
  rewrite: {
    title: "英文改写",
    description: "换成更易读的英文",
    mark: "Aa",
  },
  ask: {
    title: "AI 提问",
    description: "带上附近原文继续聊",
    mark: "?",
  },
};

const fallbackCoverPalettes = [
  { background: "#173147", ink: "#d8e8ea", accent: "#e78349" },
  { background: "#314339", ink: "#e5eadb", accent: "#c9a852" },
  { background: "#46303e", ink: "#eee0e7", accent: "#d67d68" },
  { background: "#473a2e", ink: "#efe5d4", accent: "#82a99c" },
  { background: "#26364d", ink: "#e0e6f1", accent: "#c79462" },
];

function fallbackCoverStyle(id: string) {
  let hash = 0;
  for (const character of id) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  const palette = fallbackCoverPalettes[Math.abs(hash) % fallbackCoverPalettes.length];
  return {
    "--book-cover-bg": palette.background,
    "--book-cover-ink": palette.ink,
    "--book-cover-accent": palette.accent,
  } as CSSProperties;
}

function BookCover({ book }: { book: ShelfBook }) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!book.cover) {
      setCoverUrl(null);
      return;
    }
    const url = URL.createObjectURL(book.cover);
    setCoverUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [book.cover]);

  if (coverUrl) {
    return <div className="stored-cover" aria-hidden="true"><img src={coverUrl} alt="" /></div>;
  }
  return <div className="stored-spine" style={fallbackCoverStyle(book.id)} aria-hidden="true">
    <span>{book.synced ? "CLOUD EPUB" : "LOCAL EPUB"}</span>
    <strong>{book.title.slice(0, 2).toUpperCase()}</strong>
    <i />
  </div>;
}

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
      setHealth({ provider: "offline-demo", model: null, configured: false, pendingProvider: "deepseek", searchConfigured: false });
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
    <div><strong>AI</strong><span>{message || (waitingForKey ? "等待 API 密钥" : health?.model ? `${health.provider} · ${health.model}${health.searchConfigured ? " · 可联网" : ""}` : "离线")}</span></div>
    <button disabled={!health?.configured || testState === "testing"} onClick={testConnection}>
      {testState === "testing" ? "测试中…" : testState === "passed" ? "重测" : "测试"}
    </button>
  </aside>;
}

function mergeShelf(local: StoredBook[], cloud: CloudBook[]): ShelfBook[] {
  const localById = new Map(local.map((book) => [book.id, book]));
  const merged: ShelfBook[] = cloud.map((book) => {
    const localBook = localById.get(book.id);
    return {
      ...(localBook ?? {
        id: book.id,
        title: book.title,
        fileName: book.fileName,
        blob: null,
        cover: null,
        coverChecked: false,
        addedAt: book.addedAt,
      }),
      title: localBook?.title ?? book.title,
      fileName: book.fileName,
      synced: true,
      cloud: book,
    };
  });
  for (const book of local) {
    if (!cloud.some((remote) => remote.id === book.id)) merged.push({ ...book, synced: false });
  }
  return merged.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

export function Library({ profile, onOpen, onRetest, onProfileChange, onOpenHistory }: {
  profile: ReaderProfile;
  onOpen: (source: BookSource) => void;
  onRetest: () => void;
  onProfileChange: (profile: ReaderProfile) => void;
  onOpenHistory?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const coverJobsRef = useRef(new Set<string>());
  const libraryMountedRef = useRef(true);
  const [storedBooks, setStoredBooks] = useState<ShelfBook[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>("loading");
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bookToDelete, setBookToDelete] = useState<ShelfBook | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [libraryMessage, setLibraryMessage] = useState("");
  const [bookAssistantModes, setBookAssistantModes] = useState(loadBookAssistantModes);
  const [assistantMenuBookId, setAssistantMenuBookId] = useState<string | null>(null);

  useEffect(() => {
    libraryMountedRef.current = true;
    return () => { libraryMountedRef.current = false; };
  }, []);

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

  useEffect(() => {
    if (syncState === "loading" || syncState === "syncing") return;
    for (const book of storedBooks) {
      if (book.cover || book.coverChecked || coverJobsRef.current.has(book.id)) continue;
      coverJobsRef.current.add(book.id);
      void (async () => {
        try {
          const blob = book.blob ?? (book.cloud ? await downloadCloudBook(book.cloud) : null);
          if (!blob) return;
          const hydrated = await hydrateStoredBookPresentation(book, blob);
          if (!libraryMountedRef.current) return;
          setStoredBooks((books) => books.map((candidate) => candidate.id === book.id ? {
            ...candidate,
            ...hydrated,
            synced: candidate.synced,
            cloud: candidate.cloud,
          } : candidate));
        } catch {
          // The distinctive fallback cover remains when an EPUB has no readable artwork.
        } finally {
          coverJobsRef.current.delete(book.id);
        }
      })();
    }
  }, [storedBooks, syncState]);

  useEffect(() => {
    if (!bookToDelete) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBookToDelete(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [bookToDelete]);

  async function importFiles(files: File[]) {
    if (!files.length || isImporting) return;
    const accepted = files.filter((file) => ["epub", "txt", "md", "markdown"].includes(file.name.split(".").pop()?.toLowerCase() ?? ""));
    const supported = files.length === 1
      ? accepted
      : accepted.filter((file) => file.name.split(".").pop()?.toLowerCase() === "epub");
    const unsupportedCount = files.length - supported.length;
    if (!supported.length) {
      setLibraryMessage("请选择 EPUB、TXT、MD 或 Markdown 文件。");
      return;
    }

    setIsImporting(true);
    setLibraryMessage(supported.length > 1 ? `正在把 ${supported.length} 本书放上书架…` : `正在导入《${supported[0].name}》…`);
    let importedCount = 0;
    let existingCount = 0;
    let failedCount = 0;
    let singleBookToOpen: BookSource | null = null;
    const knownBookIds = new Set(storedBooks.map((book) => book.id));

    for (const file of supported) {
      const extension = file.name.split(".").pop()?.toLowerCase();
      try {
        if (extension === "epub") {
          const stored = await saveEpub(file);
          const existing = storedBooks.find((book) => book.id === stored.id);
          const alreadyKnown = knownBookIds.has(stored.id);
          knownBookIds.add(stored.id);
          forgetDeletedBook(stored.id);
          if (!alreadyKnown || existing) {
            setStoredBooks((books) => [
              { ...stored, addedAt: existing?.addedAt ?? stored.addedAt, synced: existing?.synced ?? false, cloud: existing?.cloud },
              ...books.filter((book) => book.id !== stored.id),
            ]);
          }
          if (alreadyKnown) {
            existingCount += 1;
          } else {
            importedCount += 1;
          }
          if (!existing?.synced && (!alreadyKnown || Boolean(existing))) {
            setSyncState("syncing");
            try {
              await uploadCloudBook(stored);
              setStoredBooks((books) => books.map((book) => book.id === stored.id ? { ...book, synced: true } : book));
              setSyncState("ready");
            } catch {
              setSyncState("local");
            }
          }
          if (supported.length === 1 && !alreadyKnown) singleBookToOpen = {
            type: "epub",
            id: stored.id,
            title: stored.title,
            file,
            assistantMode: bookAssistantModes[stored.id] ?? "rewrite",
          };
        } else {
          importedCount += 1;
          if (supported.length === 1) {
            singleBookToOpen = {
              type: "text",
              title: file.name.replace(/\.(txt|md|markdown)$/i, ""),
              text: await file.text(),
              assistantMode: "rewrite",
            };
          }
        }
      } catch {
        failedCount += 1;
      }
    }

    const messages = [
      importedCount ? `已导入 ${importedCount} 本` : "",
      existingCount ? `${existingCount} 本已在书架中` : "",
      unsupportedCount ? `跳过 ${unsupportedCount} 个${files.length > 1 ? "非 EPUB" : "不支持的"}文件` : "",
      failedCount ? `${failedCount} 本导入失败` : "",
    ].filter(Boolean);
    setLibraryMessage(messages.join(" · "));
    setIsImporting(false);
    if (singleBookToOpen) onOpen(singleBookToOpen);
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
      onOpen({
        type: "epub",
        id: book.id,
        title: book.title,
        file,
        assistantMode: bookAssistantModes[book.id] ?? "rewrite",
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "打开失败");
      setOpeningId(null);
    }
  }

  async function removeBook(book: ShelfBook) {
    if (deletingId) return;
    setDeletingId(book.id);
    setBookToDelete(null);
    try {
      await deleteBookRemoteFirst({
        bookId: book.id,
        synced: book.synced,
        deleteRemote: () => deleteCloudBook(book.id),
        deleteLocal: () => deleteStoredBook(book.id),
      });
      setStoredBooks((books) => books.filter((candidate) => candidate.id !== book.id));
      setLibraryMessage(`已从书架删除《${book.title}》。`);
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

  function chooseAssistantMode(bookId: string, mode: BookAssistantMode) {
    setBookAssistantModes(saveBookAssistantMode(bookId, mode));
    setAssistantMenuBookId(null);
  }

  const syncLabel = {
    loading: "连接中",
    syncing: "同步中",
    ready: "已同步",
    local: "仅本机",
  }[syncState];
  const emptyState = syncState === "loading" || syncState === "syncing"
    ? { title: "正在整理书架。", detail: "" }
    : syncState === "local"
      ? { title: "云端暂时不可用。", detail: "你仍然可以在本机导入和阅读。" }
      : { title: "从一本真正想读的书开始。", detail: "导入 EPUB，它会留在你的书架里。" };

  return <main
    className={`library-shell ${isDragging ? "is-dragging" : ""}`}
    onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
    onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setIsDragging(true); }}
    onDragLeave={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
    }}
    onDrop={(event) => {
      event.preventDefault();
      setIsDragging(false);
      void importFiles(Array.from(event.dataTransfer.files));
    }}
  >
    <header className="topbar">
      <div className="brand-lockup"><div className="brand">Dawn Reader</div><span className={`sync-mark ${syncState}`}>{syncLabel}</span></div>
      <div className="topbar-actions">
        {onOpenHistory && <button className="history-link" type="button" onClick={onOpenHistory}>
          <span aria-hidden="true">↗</span> 查阅记录
        </button>}
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
          <button className="primary" disabled={isImporting} onClick={() => fileRef.current?.click()}>{isImporting ? "正在导入…" : "添加电子书"} <span>＋</span></button>
          <input
            ref={fileRef}
            hidden
            multiple
            type="file"
            accept=".epub,.txt,.md,.markdown"
            onChange={(event) => {
              void importFiles(Array.from(event.target.files ?? []));
              event.currentTarget.value = "";
            }}
          />
          {libraryMessage && <p className="library-message" role="status">{libraryMessage}</p>}
        </div>
      </div>
      <AiStatus />
    </section>
    <section className="shelf">
      {storedBooks.length > 0 && <>
        <div className="section-heading"><h2>继续阅读</h2></div>
        <div className="stored-shelf">
          {storedBooks.map((book) => {
            const assistantMode = bookAssistantModes[book.id] ?? "rewrite";
            const modePresentation = assistantModePresentation[assistantMode];
            const menuOpen = assistantMenuBookId === book.id;
            return <article className="stored-book" key={book.id}>
            <button className="book-open" disabled={openingId === book.id || deletingId === book.id} onClick={() => void openBook(book)}>
              <BookCover book={book} />
              <div><small>EPUB · {book.synced ? "云端" : "本机"}</small><h3>{book.title}</h3><strong>{openingId === book.id ? "正在打开…" : deletingId === book.id ? "正在删除…" : "继续阅读"} <span>→</span></strong></div>
            </button>
            <div
              className={`book-assistant-menu ${menuOpen ? "open" : ""}`}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setAssistantMenuBookId(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") setAssistantMenuBookId(null);
              }}
            >
              <button
                type="button"
                className="book-assistant-trigger"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls={`assistant-menu-${book.id}`}
                onClick={() => setAssistantMenuBookId(menuOpen ? null : book.id)}
              >
                <span className={`assistant-mode-mark ${assistantMode}`} aria-hidden="true">{modePresentation.mark}</span>
                <span className="assistant-mode-current"><small>划线后</small><strong>{modePresentation.title}</strong></span>
                <span className="assistant-chevron" aria-hidden="true" />
              </button>
              {menuOpen && <div className="book-assistant-popover" id={`assistant-menu-${book.id}`} role="menu" aria-label={`《${book.title}》划线后的动作`}>
                <p>划线后</p>
                {(Object.keys(assistantModePresentation) as BookAssistantMode[]).map((mode) => {
                  const presentation = assistantModePresentation[mode];
                  const selected = assistantMode === mode;
                  return <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    className={selected ? "selected" : ""}
                    onClick={() => chooseAssistantMode(book.id, mode)}
                    key={mode}
                  >
                    <span className={`assistant-option-mark ${mode}`} aria-hidden="true">{presentation.mark}</span>
                    <span><strong>{presentation.title}</strong><small>{presentation.description}</small></span>
                    <i aria-hidden="true">{selected ? "✓" : ""}</i>
                  </button>;
                })}
              </div>}
            </div>
            <button className="book-delete" disabled={deletingId === book.id} onClick={() => setBookToDelete(book)} aria-label={`从书架删除《${book.title}》`}>
              <span aria-hidden="true">×</span> 删除
            </button>
          </article>;})}
        </div>
      </>}
      {storedBooks.length === 0 && <div className={`library-state ${syncState}`} aria-live="polite">
        <h2>{emptyState.title}</h2>
        {emptyState.detail && <p>{emptyState.detail}</p>}
      </div>}
    </section>
    {bookToDelete && <div className="delete-dialog-backdrop" role="presentation" onMouseDown={() => setBookToDelete(null)}>
      <section className="delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-book-title" onMouseDown={(event) => event.stopPropagation()}>
        <small>从书架移除</small>
        <h2 id="delete-book-title">删除《{bookToDelete.title}》？</h2>
        <p>应用内的电子书副本和阅读进度会从已同步设备移除。你原来下载或保存在“文件”里的 EPUB 不会被删除。</p>
        <div>
          <button onClick={() => setBookToDelete(null)}>保留</button>
          <button className="danger" onClick={() => void removeBook(bookToDelete)}>删除电子书</button>
        </div>
      </section>
    </div>}
  </main>;
}
