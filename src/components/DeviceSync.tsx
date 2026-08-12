import { useEffect, useState } from "react";

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

export function DeviceSync() {
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [pairingCode, setPairingCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    void fetch("/api/devices", { cache: "no-store" })
      .then((response) => jsonResponse<{ devices: Device[] }>(response))
      .then((result) => setDevices(result.devices))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "读取设备失败。"));
  }, [open]);

  async function createPairingCode() {
    setBusy(true);
    setError("");
    try {
      const result = await jsonResponse<{ token: string; id: string; label: string; createdAt: string }>(await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "iPad" }),
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法移除设备。");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    await navigator.clipboard.writeText(pairingCode);
  }

  return <>
    <button className="sync-button" onClick={() => setOpen(true)}>同步 iPad</button>
    {open && <div className="sync-dialog-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
      <section className="sync-dialog" role="dialog" aria-modal="true" aria-labelledby="sync-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><small>设备同步</small><h2 id="sync-dialog-title">连接 iPad App</h2></div>
          <button className="dialog-close" aria-label="关闭" onClick={() => setOpen(false)}>×</button>
        </header>
        {pairingCode ? <div className="pairing-code">
          <code>{pairingCode}</code>
          <div className="pairing-actions">
            <a href={`dawnreader://pair?code=${encodeURIComponent(pairingCode)}`}>在 iPad App 中打开</a>
            <button onClick={() => void copyCode()}>复制</button>
          </div>
          <p>也可以在 iPad App 的“设置 → 设备同步”中粘贴。配对码只显示这一次。</p>
        </div> : <button className="create-pairing" disabled={busy} onClick={() => void createPairingCode()}>
          {busy ? "正在生成…" : "生成配对码"}
        </button>}
        {error && <p className="sync-error">{error}</p>}
        {devices.length > 0 && <div className="device-list">
          <small>已连接设备</small>
          {devices.map((device) => <div key={device.id}>
            <span><strong>{device.label}</strong><small>{device.lastUsedAt ? `最近同步 ${new Date(device.lastUsedAt).toLocaleDateString("zh-CN")}` : "尚未使用"}</small></span>
            <button disabled={busy} onClick={() => void revoke(device.id)}>移除</button>
          </div>)}
        </div>}
      </section>
    </div>}
  </>;
}
