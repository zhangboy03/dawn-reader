const sourceVideos = [
  ["阅读篇", "https://www.bilibili.com/video/BV1aD4y127GE"],
  ["听说篇", "https://www.bilibili.com/video/BV1tf4y1s7NN"],
  ["词汇篇", "https://www.bilibili.com/video/BV1ns4y1A7fj"],
] as const;

export function LandingPage() {
  return <main className="landing">
    <nav className="landing-nav" aria-label="主要导航">
      <a className="landing-brand" href="#top"><img src="/dawn-reader-icon.png" alt="" />Dawn Reader</a>
      <div>
        <a href="https://github.com/zhangboy03/dawn-reader">源代码</a>
        <a className="nav-cta" href="/reader">开始阅读</a>
      </div>
    </nav>

    <section className="landing-hero" id="top">
      <div className="landing-intro">
        <h1>不是把英文书<br />改简单，<br /><em>而是让你<br />读下去。</em></h1>
        <p className="hero-lede">原文是主角。帮助只在你卡住时出现。</p>
        <div className="hero-actions">
          <a className="landing-primary" href="/reader">开始阅读</a>
          <a className="landing-secondary" href="https://github.com/zhangboy03/dawn-reader">查看 GitHub</a>
        </div>
      </div>

      <div className="reading-aperture" aria-label="Dawn Reader 阅读界面示意">
        <article>
          <p>At first light, the city looked almost familiar. The streets were quiet, and every window held a small square of sky.</p>
          <p>She stopped at the bridge, <mark>reluctant to disturb the fragile calm</mark> that had settled over the river.</p>
          <p>Then the bells began, one after another, and the morning opened around her.</p>
        </article>
        <aside className="margin-help">
          <strong>reluctant to disturb</strong>
          <p>她有所顾虑，不想打破眼前脆弱的平静。</p>
        </aside>
      </div>
    </section>

    <section className="landing-thesis">
      <h2>先读原文。<br />卡住时，得到最少的帮助。<br />然后回到书里。</h2>
      <p>语言不是一串背下来的规则。它在一次次真实的相遇里，慢慢变成熟悉的感觉。</p>
    </section>

    <section className="landing-open">
      <h2>网页与 iPad，<br />一个书架。</h2>
      <p>代码开放。书留在你手里。</p>
      <a className="landing-primary inverse" href="https://github.com/zhangboy03/dawn-reader">参与开源</a>
    </section>

    <footer className="landing-footer">
      <a className="landing-brand" href="#top"><img src="/dawn-reader-icon.png" alt="" />Dawn Reader</a>
      <div className="inspiration"><span>灵感来自罗肖尼 Shawney：</span>{sourceVideos.map(([label, url]) => <a key={url} href={url}>{label}</a>)}</div>
    </footer>
  </main>;
}
