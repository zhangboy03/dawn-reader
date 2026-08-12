const sourceVideos = [
  ["总述 · 阅读篇", "https://www.bilibili.com/video/BV1aD4y127GE"],
  ["听说篇", "https://www.bilibili.com/video/BV1tf4y1s7NN"],
  ["如何真正学会一个词", "https://www.bilibili.com/video/BV1ns4y1A7fj"],
] as const;

export function LandingPage() {
  return <main className="landing">
    <nav className="landing-nav" aria-label="主要导航">
      <a className="landing-brand" href="#top"><span>DR</span>Dawn Reader</a>
      <div>
        <a href="#why">为什么</a>
        <a href="https://github.com/zhangboy03/dawn-reader">源代码</a>
        <a className="nav-cta" href="/reader">打开阅读器</a>
      </div>
    </nav>

    <section className="landing-hero" id="top">
      <div className="landing-intro">
        <p className="eyebrow">为中文母语者做的英文原著阅读器</p>
        <h1>不是把英文书<br />改简单，<br /><em>而是让你<br />有能力继续读下去。</em></h1>
        <p className="hero-lede">原书是主角。只有当你真正卡住时，释义、拆句和上下文提示才会出现。</p>
        <div className="hero-actions">
          <a className="landing-primary" href="/reader">开始阅读 <span>↗</span></a>
          <a className="landing-secondary" href="https://github.com/zhangboy03/dawn-reader">查看 GitHub</a>
        </div>
        <p className="open-note">开放源代码 · EPUB 本地优先 · iPad 与网页端</p>
      </div>

      <div className="reading-aperture" aria-label="Dawn Reader 阅读界面示意">
        <div className="aperture-top"><span>THE DISTANT SHORE</span><span>42%</span></div>
        <article>
          <p>At first light, the city looked almost familiar. The streets were quiet, and every window held a small square of sky.</p>
          <p>She stopped at the bridge, <mark>reluctant to disturb the fragile calm</mark> that had settled over the river.</p>
          <p>Then the bells began, one after another, and the morning opened around her.</p>
        </article>
        <aside className="margin-help">
          <span>卡住才出现</span>
          <strong>reluctant to…</strong>
          <p>想做，但仍有顾虑。这里不是“不愿意”，而是不想打破眼前的平静。</p>
        </aside>
        <div className="aperture-line" />
      </div>
    </section>

    <section className="landing-thesis" id="why">
      <p className="section-number">01 / 为什么</p>
      <div>
        <h2>语言不是一串背下来的规则，<br />它更像在真实语境里长出来的感觉。</h2>
        <p>Dawn Reader 关心的不是你今天记住了多少，而是你能不能长期读懂自己真正在乎的英文。读得懂，才愿意继续；愿意继续，数量才会发生。词义、搭配和句式，便在一次次相遇中逐渐变得熟悉。</p>
      </div>
    </section>

    <section className="landing-loop" aria-labelledby="loop-title">
      <p className="section-number">02 / 阅读闭环</p>
      <h2 id="loop-title">把帮助放在卡点，<br />把注意力还给原书。</h2>
      <ol>
        <li><span>01</span><div><strong>先读原文</strong><p>不预先改写整章，不用双语对照淹没页面。</p></div></li>
        <li><span>02</span><div><strong>遇到阻力</strong><p>点词、选句，或用 Apple Pencil 圈出真正卡住的地方。</p></div></li>
        <li><span>03</span><div><strong>得到最小帮助</strong><p>结合上下文解释这一次的意思，然后立刻回到原文。</p></div></li>
      </ol>
    </section>

    <section className="landing-open">
      <div>
        <p className="section-number">03 / 开放共建</p>
        <h2>一本书的难，不该成为你离开它的理由。</h2>
      </div>
      <div className="open-copy">
        <p>这是一个仍在生长的开源项目。网页端和 iPad 端共享书架、进度与阅读辅助设置；你的 EPUB 不会进入仓库。</p>
        <a className="landing-primary inverse" href="https://github.com/zhangboy03/dawn-reader">参与 Dawn Reader <span>↗</span></a>
      </div>
    </section>

    <footer className="landing-footer">
      <div><span className="footer-mark">DR</span><p>Dawn Reader<br /><small>Original text first.</small></p></div>
      <div className="inspiration"><span>产品假设受罗肖尼 Shawney 的视频启发：</span>{sourceVideos.map(([label, url]) => <a key={url} href={url}>{label}</a>)}</div>
    </footer>
  </main>;
}
