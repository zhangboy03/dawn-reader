// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { rewriteDrilldownSelection } from "./rewriteDrilldown";

function select(start: Node, startOffset: number, end: Node, endOffset: number) {
  const range = document.createRange();
  range.setStart(start, startOffset);
  range.setEnd(end, endOffset);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

describe("rewrite drill-down selection", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <p id="rewrite">A <em>less familiar</em> phrase remains readable.</p>
      <button id="outside">Close</button>
    `;
    window.getSelection()?.removeAllRanges();
  });

  it("accepts a word, phrase, or complete sentence inside the rewrite", () => {
    const root = document.querySelector<HTMLElement>("#rewrite")!;
    const opening = root.firstChild!;
    const nested = root.querySelector("em")!.firstChild!;
    const ending = root.lastChild!;

    select(nested, 5, nested, 13);
    expect(rewriteDrilldownSelection(root)?.text).toBe("familiar");

    select(nested, 0, nested, 13);
    expect(rewriteDrilldownSelection(root)?.text).toBe("less familiar");

    select(opening, 0, ending, ending.textContent!.length);
    expect(rewriteDrilldownSelection(root)?.text).toBe("A less familiar phrase remains readable.");
  });

  it("rejects a selection that crosses into the popup chrome", () => {
    const root = document.querySelector<HTMLElement>("#rewrite")!;
    const outside = document.querySelector<HTMLElement>("#outside")!;
    select(root.firstChild!, 0, outside.firstChild!, 5);

    expect(rewriteDrilldownSelection(root)).toBeNull();
  });
});
