import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Device = {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
};

async function jsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(body?.error ?? "同步设置失败。");
  return body as T;
}

function deviceKind(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("iphone")) return "phone";
  if (normalized.includes("ipad")) return "tablet";
  return "reader";
}

function lastUsedLabel(value: string | null) {
  if (!value) return "等待首次连接";
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return `今天 ${new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date)}`;
  }
  return `最近同步 ${new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(date)}`;
}

export function DeviceSync() {
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [pairingCode, setPairingCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  async function loadDevices() {
    const result = await jsonResponse<{ devices: Device[] }>(await fetch("/api/devices", { cache: "no-store" }));
    setDevices(result.devices);
  }

  useEffect(() => {
    if (!open) return;
    setError("");
    void loadDevices().catch((caught) => setError(caught instanceof Error ? caught.message : "读取设备失败。"));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open || !pairingCode) return;
    const timer = window.setInterval(() => {
      void loadDevices().catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [open, pairingCode]);

  async function createPairingCode() {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const result = await jsonResponse<{ token: string; id: string; label: string; createdAt: string }>(await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "新设备" }),
      }));
      setPairingCode(result.token);
      setDevices((current) => [{ id: result.id, label: result.label, createdAt: result.createdAt, lastUsedAt: null }, ...current]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法生成配对码。");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    setError("");
    try {
      await jsonResponse(await fetch(`/api/devices/${encodeURIComponent(id)}`, { method: "DELETE" }));
      setDevices((current) => current.filter((device) => device.id !== id));
      if (editingId === id) setEditingId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法移除设备。");
    } finally {
      setBusy(false);
    }
  }

  async function rename(id: string) {
    const label = editingLabel.trim();
    if (!label) return;
    setBusy(true);
    setError("");
    try {
      const result = await jsonResponse<{ device: Device }>(await fetch(`/api/devices/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      }));
      setDevices((current) => current.map((device) => device.id === id ? result.device : device));
      setEditingId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法修改设备名称。");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(pairingCode);
      setCopied(true);
    } catch {
      setError("无法访问剪贴板，请手动选择并复制配对码。");
    }
  }

  function beginRename(device: Device) {
    setEditingId(device.id);
    setEditingLabel(device.label);
  }

  return <>
    <button className="sync-button" onClick={() => setOpen(true)}>设备同步</button>
    {open && typeof document !== "undefined" && createPortal(<div className="sync-dialog-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
      <section
        className="sync-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-dialog-title"
        aria-describedby="sync-dialog-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <small>设备同步</small>
            <h2 id="sync-dialog-title">把阅读带到每块屏幕</h2>
            <p id="sync-dialog-description">连接 iPhone 或 iPad，同步书籍、阅读位置与排版设置。</p>
          </div>
          <button className="dialog-close" aria-label="关闭设备同步" onClick={() => setOpen(false)}>×</button>
        </header>

        <div className="pairing-section">
          <div className="pairing-section-heading">
            <span aria-hidden="true">01</span>
            <div><strong>连接新设备</strong><small>配对码仅显示一次</small></div>
          </div>
          {pairingCode ? <div className="pairing-code">
            <code>{pairingCode}</code>
            <div className="pairing-actions">
              <a href={`dawnreader://pair?code=${encodeURIComponent(pairingCode)}`}>在 Dawn Reader 中打开</a>
              <button onClick={() => void copyCode()}>{copied ? "已复制" : "复制配对码"}</button>
            </div>
            <p>也可以在移动端 Dawn Reader 的“设置 → 设备同步”中粘贴。</p>
          </div> : <div className="pairing-invitation">
            <p>生成配对码后，在要连接的 iPhone 或 iPad 上打开它。</p>
            <button className="create-pairing" disabled={busy} onClick={() => void createPairingCode()}>
              {busy ? "正在生成…" : "连接新设备"}
            </button>
          </div>}
        </div>

        {error && <p className="sync-error" role="alert">{error}</p>}

        <div className="device-list">
          <div className="device-list-heading">
            <span aria-hidden="true">02</span>
            <div><strong>已连接设备</strong><small>{devices.length} 台设备</small></div>
          </div>
          {devices.length === 0 ? <p className="device-list-empty">还没有连接移动设备。</p> : devices.map((device) => <div className="device-row" key={device.id}>
            <i className={`device-glyph ${deviceKind(device.label)}`} aria-hidden="true" />
            <div className="device-meta">
              {editingId === device.id ? <form onSubmit={(event) => { event.preventDefault(); void rename(device.id); }}>
                <label className="device-name-label" htmlFor={`device-name-${device.id}`}>设备名称</label>
                <input
                  id={`device-name-${device.id}`}
                  maxLength={80}
                  value={editingLabel}
                  onChange={(event) => setEditingLabel(event.target.value)}
                  autoFocus
                />
                <button disabled={busy || !editingLabel.trim()} type="submit">保存</button>
                <button type="button" onClick={() => setEditingId(null)}>取消</button>
              </form> : <>
                <strong>{device.label}</strong>
                <small className={device.lastUsedAt ? "connected" : "pending"}>{lastUsedLabel(device.lastUsedAt)}</small>
              </>}
            </div>
            {editingId !== device.id && <div className="device-actions">
              <button disabled={busy} onClick={() => beginRename(device)}>改名</button>
              <button className="remove" disabled={busy} onClick={() => void revoke(device.id)}>移除</button>
            </div>}
          </div>)}
        </div>
      </section>
    </div>, document.body)}
  </>;
}
