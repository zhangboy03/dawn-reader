import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LandingPage } from "./LandingPage";

describe("LandingPage", () => {
  it("keeps each half of the headline in its own responsive line", () => {
    const markup = renderToStaticMarkup(<LandingPage />);

    expect(markup).toContain('<span class="landing-headline-line">读原文。</span>');
    expect(markup).toContain(
      '<span class="landing-headline-line landing-headline-line-accent">读下去。</span>',
    );
  });
});
