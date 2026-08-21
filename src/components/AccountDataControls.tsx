import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { clearLocalAccountData } from "../lib/localAccountData";

const CONFIRMATION = "DELETE MY DAWN DATA";

export function AccountDataControls() {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) setOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy]);

  async function deleteAccount() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "账户数据删除失败。");
      const local = await clearLocalAccountData();
      setDeleted(true);
      setMessage(local.fullyCleared
        ? "云端和本机 Dawn Reader 数据已删除。"
        : "云端数据已删除；请关闭其他 Dawn Reader 标签页后清除本站数据，以完成本机清理。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "账户数据删除失败。");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button className="sync-button" type="button" onClick={() => setOpen(true)}>数据与隐私</button>
    {open && typeof document !== "undefined" && createPortal(<div className="sync-dialog-backdrop" role="presentation" onMouseDown={() => { if (!busy) setOpen(false); }}>
      <section
        className="sync-dialog account-data-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-data-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div><small>数据与隐私</small><h2 id="account-data-title">带走或删除你的数据</h2></div>
          <button className="dialog-close" aria-label="关闭数据与隐私" disabled={busy} onClick={() => setOpen(false)}>×</button>
        </header>
        <div className="pairing-section account-export-section">
          <div className="pairing-section-heading"><span aria-hidden="true">01</span><div><strong>导出云端数据</strong><small>ZIP · 清单与全部云端 EPUB</small></div></div>
          <p>导出包包含书籍文件、阅读位置、设置、设备清单和删除屏障。PDF、高亮与本机查阅记录不会上传，请另行保留原文件。</p>
          <a className="account-export-button" href="/api/account/export" download>下载账户导出</a>
          <a className="account-signout-link" href="/signout-with-chatgpt?return_to=/">退出 Dawn Reader</a>
        </div>
        <div className="pairing-section account-delete-section">
          <div className="pairing-section-heading"><span aria-hidden="true">02</span><div><strong>删除 Dawn Reader 数据</strong><small>不可撤销</small></div></div>
          <p>删除全部云端 EPUB、进度、设置、设备凭据和删除屏障，并尝试清除当前浏览器中的 Dawn Reader 数据。登录身份本身由 ChatGPT 管理，不会被删除。</p>
          {!deleted && <label className="account-delete-confirmation">输入 <code>{CONFIRMATION}</code>
            <input value={confirmation} disabled={busy} autoComplete="off" onChange={(event) => setConfirmation(event.target.value)} />
          </label>}
          {!deleted && <button className="account-delete-button" disabled={busy || confirmation !== CONFIRMATION} onClick={() => void deleteAccount()}>
            {busy ? "正在删除…" : "永久删除我的 Dawn 数据"}
          </button>}
          {message && <p className={deleted ? "account-data-success" : "sync-error"} role="status">{message}</p>}
        </div>
      </section>
    </div>, document.body)}
  </>;
}
