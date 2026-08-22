"use client";

import { useState, type FormEvent } from "react";
import type { OwnerInviteOverview } from "../server/dawnAuth";

type CreatedInvite = { code: string; expiresAt: string; joinUrl: string };

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function InviteManager({ initialOverview }: { initialOverview: OwnerInviteOverview }) {
  const [overview, setOverview] = useState(initialOverview);
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: form.get("displayName"),
          contactEmail: form.get("contactEmail"),
        }),
      });
      if (!response.ok) throw new Error("create failed");
      const createdInvite = await response.json() as CreatedInvite;
      formElement.reset();
      setCreated(createdInvite);
    } catch {
      setError("邀请码创建失败。没有向测试者发送任何内容，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(kind: "invites" | "sessions", id: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/${kind}/${encodeURIComponent(id)}/revoke`, { method: "POST" });
      if (!response.ok) throw new Error("revoke failed");
      const now = new Date().toISOString();
      setOverview((current) => kind === "invites"
        ? { ...current, invites: current.invites.map((item) => item.id === id ? { ...item, revokedAt: now } : item) }
        : { ...current, sessions: current.sessions.map((item) => item.id === id ? { ...item, revokedAt: now } : item) });
    } catch {
      setError("撤销没有完成，请刷新后确认状态。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="invite-admin-shell">
      <header className="invite-admin-header">
        <div><p>Dawn Beta · Owner</p><h1>邀请与会话</h1></div>
        <a href="/reader">返回书架</a>
      </header>

      <section className="invite-panel">
        <h2>创建第一位测试者</h2>
        <p>这里只创建账号和一次性短码，不发送邮件。短码使用 10 个防混淆字符，你确认后再单独交给测试者。</p>
        <form onSubmit={createInvite} className="invite-create-form">
          <label>测试者备注<input name="displayName" required maxLength={120} placeholder="例如：香港测试者 1" /></label>
          <label>联系邮箱（可选）<input name="contactEmail" type="email" maxLength={320} autoComplete="off" /></label>
          <button type="submit" disabled={busy}>生成一次性邀请码</button>
        </form>
        {created && (
          <div className="invite-secret" role="status">
            <strong>只显示这一次</strong>
            <code>{created.code}</code>
            <p>让测试者打开 <b>{created.joinUrl}</b>，在 {dateLabel(created.expiresAt)} 前输入邀请码。</p>
            <button type="button" onClick={() => void navigator.clipboard.writeText(created.code)}>复制邀请码</button>
          </div>
        )}
        {error && <p className="invite-error" role="alert">{error}</p>}
      </section>

      <section className="invite-panel">
        <h2>已创建账号</h2>
        <div className="invite-list">
          {overview.accounts.filter((account) => account.role !== "owner").map((account) => (
            <article key={account.id}><strong>{account.displayName || "未命名测试者"}</strong><span>{account.contactEmail || "未保存邮箱"}</span><small>{account.status}</small></article>
          ))}
          {!overview.accounts.some((account) => account.role !== "owner") && <p>还没有测试者账号。</p>}
        </div>
      </section>

      <section className="invite-panel">
        <h2>邀请码</h2>
        <div className="invite-list">
          {overview.invites.map((invite) => {
            const active = !invite.consumedAt && !invite.revokedAt && invite.expiresAt > new Date().toISOString();
            return <article key={invite.id}><strong>{invite.accountName || "测试者"}</strong><span>{invite.consumedAt ? "已使用" : invite.revokedAt ? "已撤销" : active ? "等待使用" : "已过期"}</span><small>{dateLabel(invite.createdAt)}</small>{active && <button type="button" disabled={busy} onClick={() => void revoke("invites", invite.id)}>撤销</button>}</article>;
          })}
        </div>
      </section>

      <section className="invite-panel">
        <h2>活跃会话</h2>
        <div className="invite-list">
          {overview.sessions.map((session) => (
            <article key={session.id}><strong>{session.accountName || "测试者"}</strong><span>{session.revokedAt ? "已撤销" : "有效至 " + dateLabel(session.absoluteExpiresAt)}</span><small>最近使用 {dateLabel(session.lastUsedAt)}</small>{!session.revokedAt && <button type="button" disabled={busy} onClick={() => void revoke("sessions", session.id)}>退出此设备</button>}</article>
          ))}
          {!overview.sessions.length && <p>还没有 Dawn 会话。</p>}
        </div>
      </section>
    </main>
  );
}
