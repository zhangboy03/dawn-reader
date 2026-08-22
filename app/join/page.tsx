export const dynamic = "force-dynamic";

export default async function JoinPage({ searchParams }: {
  searchParams?: Promise<{ error?: string; return_to?: string }>;
}) {
  const params = await searchParams;
  const returnTo = params?.return_to?.startsWith("/") && !params.return_to.startsWith("//")
    ? params.return_to
    : "/reader";
  return (
    <main className="join-shell">
      <section className="join-card" aria-labelledby="join-title">
        <p className="join-eyebrow">Dawn Reader Beta</p>
        <h1 id="join-title">输入你的一次性邀请码</h1>
        <p>邀请码只用于第一次加入。成功后，这台浏览器会获得一个独立、可撤销的 Dawn 会话；不需要 ChatGPT 或 OpenAI 账号。</p>
        {params?.error && <p className="join-error" role="alert">邀请码无效、已使用或已过期。请向邀请人索取新的邀请码。</p>}
        <form method="post" action="/api/auth/redeem" className="join-form">
          <input type="hidden" name="return_to" value={returnTo} />
          <label htmlFor="invite-code">一次性邀请码</label>
          <input id="invite-code" name="code" type="text" required autoComplete="one-time-code" inputMode="text" maxLength={20} spellCheck={false} placeholder="ABCD-EFGH-JK" />
          <button type="submit">进入 Dawn Reader</button>
        </form>
        <p className="join-footnote">Dawn 不会把邀请码当作长期密码，也不会把它保存在浏览器地址中。</p>
      </section>
    </main>
  );
}
