export function LandingPage() {
  return (
    <main className="landing">
      <nav className="landing-nav" aria-label="主要导航">
        <a className="landing-brand" href="/" aria-label="Dawn Reader 首页">
          <img src="/dawn-reader-icon.png" alt="" width="40" height="40" />
          <span>Dawn Reader</span>
        </a>

        <div className="landing-links">
          <a href="/privacy">隐私</a>
          <a className="landing-github" href="https://github.com/zhangboy03/dawn-reader">GitHub</a>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="landing-intro">
          <h1>
            <span className="landing-headline-line">读原文。</span>
            <span className="landing-headline-line landing-headline-line-accent">读下去。</span>
          </h1>
          <a className="landing-primary" href="/reader">
            开始阅读
          </a>
        </div>

        <div className="landing-visual">
          <img
            src="/dawn-reader-icon.png"
            alt="Dawn Reader 图标：书页、远山与日出"
            width="1024"
            height="1024"
            fetchPriority="high"
          />
        </div>
      </section>
    </main>
  );
}
