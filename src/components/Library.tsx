import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { ReaderProfile } from "../lib/storage";
import {
  cacheStoredBook,
  deleteStoredBook,
  filterBooksByQuery,
  hydrateStoredBookPresentation,
  hydrateStoredPdfPresentation,
  listStoredBooks,
  markStoredBookOpened,
  savePublication,
  sortBooksByRecency,
  storedBookFile,
  type StoredBook,
} from "../lib/bookStore";
import { paperAuthorLabel } from "../lib/paperMetadata";
import { deleteBookRemoteFirst, deletedBookIds, forgetDeletedBook, rememberDeletedBook } from "../lib/bookDeletion";
import {
  deleteCloudBook,
  downloadCloudBook,
  loadCloudLibrary,
  uploadCloudBook,
  type CloudBook,
} from "../lib/cloudSync";
import { deletePdfHighlightSidecar } from "../lib/pdfHighlights";
import { deletePdfLocator } from "../lib/pdfLocator";
import { isCloudEligiblePublication, publicationFormat, shelfFormatLabel, type PdfBookSource } from "../lib/publication";
import { DeviceSync } from "./DeviceSync";

export type BookSource = (
  { type: "text"; title: string; text: string }
  | { type: "epub"; id?: string; title: string; file: File }
) & {
  initialCfi?: string | null;
  referenceReturnCfi?: string | null;
  returnToHistory?: boolean;
};

export type PublicationSource = BookSource | PdfBookSource;

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

function paperCoverStyle(id: string) {
  const accents = ["#c96f43", "#3f7281", "#718061", "#8a5f71", "#9a7a3e"];
  let hash = 0;
  for (const character of id) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return { "--paper-accent": accents[Math.abs(hash) % accents.length] } as CSSProperties;
}

function BookCover({ book }: { book: ShelfBook }) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const format = publicationFormat(book);
  useEffect(() => {
    if (!book.cover) {
      setCoverUrl(null);
      return;
    }
    const url = URL.createObjectURL(book.cover);
    setCoverUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [book.cover, format]);

  if (coverUrl) {
    if (format === "pdf") {
      const author = paperAuthorLabel(book.paperAuthor);
      return <div className="stored-cover pdf-paper" style={paperCoverStyle(book.id)} aria-hidden="true">
        <img src={coverUrl} alt="" />
        <span className="paper-catalog-tab" />
        <span className="paper-format-mark">PDF</span>
        <span className="paper-identity">
          <b>{author ?? "FIRST PAGE"}</b>
          {book.paperYear && <i>{book.paperYear}</i>}
        </span>
      </div>;
    }
    return <div className="stored-cover" aria-hidden="true"><img src={coverUrl} alt="" /></div>;
  }
  if (format === "pdf") {
    return <div className="stored-spine pdf" aria-hidden="true">
      <span>LOCAL PAPER</span><strong>PDF</strong><i />
    </div>;
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
  const localById = new Map(local.filter(isCloudEligiblePublication).map((book) => [book.id, book]));
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
        format: "epub" as const,
        addedAt: book.addedAt,
      }),
      format: "epub",
      title: localBook?.title ?? book.title,
      fileName: book.fileName,
      synced: true,
      cloud: book,
    };
  });
  for (const book of local) {
    if (publicationFormat(book) === "pdf" || !cloud.some((remote) => remote.id === book.id)) {
      merged.push({ ...book, synced: false });
    }
  }
  return sortBooksByRecency(merged);
}

export function Library({ profile, role, authKind, onOpen, onRetest, onProfileChange, onOpenHistory }: {
  profile: ReaderProfile;
  role: "owner" | "reader";
  authKind: "chatgpt" | "dawn_session" | "device";
  onOpen: (source: PublicationSource) => void;
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
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    libraryMountedRef.current = true;
    return () => { libraryMountedRef.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function syncLibrary() {
      const tombstones = deletedBookIds();
      const allLocal = await listStoredBooks().catch(() => []);
      const local = allLocal.filter((book) => publicationFormat(book) === "pdf" || !tombstones.has(book.id));
      if (cancelled) return;
      setStoredBooks(local.map((book) => ({ ...book, synced: false })));
      try {
        const cloudLibrary = await loadCloudLibrary();
        const deletionDates = new Map((cloudLibrary.deletedBooks ?? []).map((item) => [item.id, item.deletedAt]));
        const staleServerDeletedIds = new Set(allLocal.filter((book) => {
          if (publicationFormat(book) !== "epub") return false;
          const deletedAt = deletionDates.get(book.id);
          return deletedAt ? book.addedAt <= deletedAt : false;
        }).map((book) => book.id));
        const deletedEverywhere = new Set([...tombstones, ...staleServerDeletedIds]);
        for (const book of allLocal.filter((candidate) => staleServerDeletedIds.has(candidate.id))) {
          rememberDeletedBook(book.id);
          await deleteStoredBook(book.id).catch(() => undefined);
        }
        for (const cloudBook of cloudLibrary.books.filter((book) => tombstones.has(book.id))) {
          await deleteCloudBook(cloudBook.id).catch(() => undefined);
        }
        const visibleLocal = local.filter((book) => publicationFormat(book) === "pdf" || !deletedEverywhere.has(book.id));
        const visibleCloud = cloudLibrary.books.filter((book) => !deletedEverywhere.has(book.id));
        if (cancelled) return;
        setStoredBooks(mergeShelf(visibleLocal, visibleCloud));
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
      const format = publicationFormat(book);
      if (book.cover || book.coverChecked || coverJobsRef.current.has(book.id)) continue;
      coverJobsRef.current.add(book.id);
      void (async () => {
        try {
          const blob = book.blob ?? (book.cloud ? await downloadCloudBook(book.cloud) : null);
          if (!blob) return;
          const hydrated = format === "pdf"
            ? await hydrateStoredPdfPresentation(book, blob)
            : await hydrateStoredBookPresentation(book, blob);
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
    const accepted = files.filter((file) => ["epub", "pdf", "txt", "md", "markdown"].includes(file.name.split(".").pop()?.toLowerCase() ?? ""));
    const supported = files.length === 1
      ? accepted
      : accepted.filter((file) => ["epub", "pdf"].includes(file.name.split(".").pop()?.toLowerCase() ?? ""));
    const unsupportedCount = files.length - supported.length;
    if (!supported.length) {
      setLibraryMessage("请选择 EPUB、PDF、TXT、MD 或 Markdown 文件。");
      return;
    }

    setIsImporting(true);
    setLibraryMessage(supported.length > 1 ? `正在把 ${supported.length} 个文件放上书架…` : `正在导入《${supported[0].name}》…`);
    let importedCount = 0;
    let existingCount = 0;
    let failedCount = 0;
    let importedPdf = false;
    let lastFailure = "";
    let singleBookToOpen: PublicationSource | null = null;
    const knownBookIds = new Set(storedBooks.map((book) => book.id));

    for (const file of supported) {
      const extension = file.name.split(".").pop()?.toLowerCase();
      try {
        if (extension === "epub" || extension === "pdf") {
          const stored = await savePublication(file);
          const format = publicationFormat(stored);
          const existing = storedBooks.find((book) => book.id === stored.id);
          const alreadyKnown = knownBookIds.has(stored.id);
          knownBookIds.add(stored.id);
          if (format === "epub") forgetDeletedBook(stored.id);
          setStoredBooks((books) => sortBooksByRecency([
            { ...stored, addedAt: existing?.addedAt ?? stored.addedAt, synced: format === "epub" ? existing?.synced ?? false : false, cloud: format === "epub" ? existing?.cloud : undefined },
            ...books.filter((book) => book.id !== stored.id),
          ]));
          if (alreadyKnown) existingCount += 1;
          else importedCount += 1;

          if (format === "epub" && !existing?.synced && (!alreadyKnown || Boolean(existing))) {
            setSyncState("syncing");
            try {
              await uploadCloudBook(stored);
              setStoredBooks((books) => books.map((book) => book.id === stored.id ? { ...book, synced: true } : book));
              setSyncState("ready");
            } catch {
              setSyncState("local");
            }
          }
          if (format === "pdf") importedPdf = true;
          if (supported.length === 1 && !alreadyKnown) {
            singleBookToOpen = format === "pdf"
              ? { type: "pdf", id: stored.id, title: stored.title, file }
              : { type: "epub", id: stored.id, title: stored.title, file };
          }
        } else {
          importedCount += 1;
          if (supported.length === 1) {
            singleBookToOpen = {
              type: "text",
              title: file.name.replace(/\.(txt|md|markdown)$/i, ""),
              text: await file.text(),
            };
          }
        }
      } catch (error) {
        failedCount += 1;
        lastFailure = error instanceof Error ? error.message : "导入失败";
      }
    }

    const messages = [
      importedCount ? `已导入 ${importedCount} 个文件` : "",
      existingCount ? `${existingCount} 个已在书架中` : "",
      importedPdf ? "PDF 已保存在此浏览器，Dawn 不会自动上传" : "",
      unsupportedCount ? `跳过 ${unsupportedCount} 个不支持的文件` : "",
      failedCount ? `${failedCount} 个导入失败${lastFailure ? `：${lastFailure}` : ""}` : "",
    ].filter(Boolean);
    setLibraryMessage(messages.join(" · "));
    setIsImporting(false);
    if (singleBookToOpen) onOpen(singleBookToOpen);
  }

  async function openBook(book: ShelfBook) {
    if (openingId) return;
    setOpeningId(book.id);
    try {
      const format = publicationFormat(book);
      let file: File;
      let localBook: StoredBook = book;
      if (book.blob) {
        file = storedBookFile(book);
      } else if (format === "epub" && book.cloud) {
        file = await downloadCloudBook(book.cloud);
        localBook = await cacheStoredBook(book, file);
      } else {
        throw new Error(format === "pdf" ? "这份 PDF 的本机副本不可用，请重新导入。" : "这本书尚未同步到当前设备。");
      }
      const openedAt = new Date().toISOString();
      setStoredBooks((books) => sortBooksByRecency(books.map((candidate) => (
        candidate.id === book.id ? { ...candidate, lastOpenedAt: openedAt } : candidate
      ))));
      void markStoredBookOpened(localBook.id, openedAt).catch(() => undefined);
      if (format === "pdf") {
        onOpen({ type: "pdf", id: book.id, title: book.title, file });
      } else {
        onOpen({
          type: "epub",
          id: book.id,
          title: book.title,
          file,
        });
      }
    } catch (error) {
      setLibraryMessage(error instanceof Error ? error.message : "打开失败");
      setOpeningId(null);
    }
  }

  async function removeBook(book: ShelfBook) {
    if (deletingId) return;
    setDeletingId(book.id);
    setBookToDelete(null);
    const format = publicationFormat(book);
    try {
      if (format === "pdf") {
        await deleteStoredBook(book.id);
        deletePdfLocator(book.id);
        deletePdfHighlightSidecar(book.id);
      } else {
        await deleteBookRemoteFirst({
          bookId: book.id,
          synced: book.synced,
          deleteRemote: () => deleteCloudBook(book.id),
          deleteLocal: () => deleteStoredBook(book.id),
        });
      }
      setStoredBooks((books) => books.filter((candidate) => candidate.id !== book.id));
      setLibraryMessage(`已从书架删除《${book.title}》。`);
    } catch (error) {
      if (format === "epub" && deletedBookIds().has(book.id)) {
        setStoredBooks((books) => books.filter((candidate) => candidate.id !== book.id));
        setLibraryMessage("云端已删除；本机缓存将在下次打开时继续清理。");
      } else {
        setLibraryMessage(error instanceof Error ? error.message : "删除失败，请稍后重试。");
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
  const emptyState = syncState === "loading" || syncState === "syncing"
    ? { title: "正在整理书架。", detail: "" }
    : syncState === "local"
      ? { title: "云端暂时不可用。", detail: "你仍然可以在本机导入和阅读。" }
      : { title: "从一本真正想读的书或论文开始。", detail: "导入 EPUB 或 PDF；PDF 只保存在当前浏览器。" };
  const visibleBooks = filterBooksByQuery(storedBooks, searchQuery);
  const hasSearch = Boolean(searchQuery.trim());

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
        {role === "owner" && authKind === "chatgpt" && <a className="account-link" href="/admin/invites">邀请管理</a>}
        {onOpenHistory && <button className="history-link" type="button" onClick={onOpenHistory}>
          <span aria-hidden="true">↗</span> 查阅记录
        </button>}
        <DeviceSync />
        {authKind === "dawn_session" && <form method="post" action="/api/auth/logout" className="logout-form"><button type="submit">退出</button></form>}
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
          <button className="primary" disabled={isImporting} onClick={() => fileRef.current?.click()}>{isImporting ? "正在导入…" : "添加书籍或论文"} <span>＋</span></button>
          <input
            ref={fileRef}
            hidden
            multiple
            type="file"
            accept=".epub,.pdf,.txt,.md,.markdown"
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
        <div className="section-heading shelf-heading">
          <div>
            <h2>继续阅读</h2>
            {hasSearch && <small role="status">{visibleBooks.length ? `${visibleBooks.length} 本匹配` : "没有匹配的材料"}</small>}
          </div>
          <label className="shelf-search">
            <span className="search-glyph" aria-hidden="true" />
            <span className="visually-hidden">搜索书架</span>
            <input
              type="search"
              aria-label="搜索书架"
              value={searchQuery}
              placeholder="搜索书名"
              autoComplete="off"
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            {hasSearch && <button type="button" onClick={() => setSearchQuery("")} aria-label="清空搜索">×</button>}
          </label>
        </div>
        {visibleBooks.length > 0 && <div className="stored-shelf">
          {visibleBooks.map((book) => {
            const format = publicationFormat(book);
            return <article className={`stored-book ${format}`} key={book.id}>
            <button
              className="book-open"
              disabled={openingId === book.id || deletingId === book.id}
              onPointerEnter={() => {
                if (format === "pdf") void import("./pdf/PdfReader").then((module) => module.preloadPdfRuntime()).catch(() => undefined);
              }}
              onFocus={() => {
                if (format === "pdf") void import("./pdf/PdfReader").then((module) => module.preloadPdfRuntime()).catch(() => undefined);
              }}
              onClick={() => void openBook(book)}
            >
              <BookCover book={book} />
              <div><small>{shelfFormatLabel(book, book.synced)}</small><h3>{book.title}</h3><strong>{openingId === book.id ? "正在打开…" : deletingId === book.id ? "正在删除…" : "继续阅读"} <span>→</span></strong></div>
            </button>
            <button className="book-delete" disabled={deletingId === book.id} onClick={() => setBookToDelete(book)} aria-label={`从书架删除《${book.title}》`}>
              <span aria-hidden="true">×</span> 删除
            </button>
          </article>;})}
        </div>}
        {hasSearch && visibleBooks.length === 0 && <div className="shelf-no-results" aria-live="polite">
          <h3>书架里没有“{searchQuery.trim()}”</h3>
          <p>可以换一个书名、论文名或文件名试试。</p>
          <button type="button" onClick={() => setSearchQuery("")}>查看全部材料</button>
        </div>}
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
        <p>{publicationFormat(bookToDelete) === "pdf"
          ? "Dawn 会删除此浏览器中的 PDF 副本、阅读位置和黄色高亮。你电脑上的原文件不会被删除。"
          : "应用内的电子书副本和阅读进度会从已同步设备移除。你原来下载或保存在“文件”里的 EPUB 不会被删除。"}</p>
        <div>
          <button onClick={() => setBookToDelete(null)}>保留</button>
          <button className="danger" onClick={() => void removeBook(bookToDelete)}>{publicationFormat(bookToDelete) === "pdf" ? "删除 PDF" : "删除电子书"}</button>
        </div>
      </section>
    </div>}
  </main>;
}
