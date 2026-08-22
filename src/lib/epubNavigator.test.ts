import { describe, expect, it } from "vitest";
import {
  EpubAnchorNotVisibleError,
  EpubLayoutSignatureTracker,
  EpubNavigator,
  EpubPresentationNotVisibleError,
  EpubViewportStability,
  epubAnchorClientRects,
  epubContentRectIsVisible,
  epubFrameSize,
  epubNavigationTargetFromLink,
  epubRendererFitScale,
  sameEpubFrameSize,
  type EpubCommit,
  type EpubLocator,
  type EpubRenderer,
  type EpubRendererSlot,
  type EpubRendererSlotState,
  type EpubTurnDirection,
} from "./epubNavigator";

type Config = {
  name: string;
  width?: number;
  height?: number;
  fontSize?: number;
  lineHeight?: number;
  pageWidth?: number;
  theme?: string;
  mediaRevision?: number;
  displayGate?: Deferred<void>;
  prepareGate?: Deferred<void>;
  visible?: boolean;
  presentable?: boolean;
  visibleSequence?: boolean[];
  visibilityGates?: Array<Deferred<void> | undefined>;
  focused?: boolean;
  rejectTarget?: boolean;
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>["resolve"];
  let reject!: Deferred<T>["reject"];
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function pageFromTarget(target: string | undefined) {
  const value = Number(target?.match(/(\d+)(?:\D*)$/)?.[1] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function locator(page: number): EpubLocator {
  return { cfi: `epubcfi(/6/${page})`, href: `chapter-${Math.floor(page / 10)}.xhtml`, percentage: page / 100 };
}

class FakeRenderer implements EpubRenderer {
  page = 0;
  destroyed = false;
  focused: boolean;
  focusCalls = 0;
  readonly operations: string[] = [];

  constructor(readonly config: Config) {
    this.focused = Boolean(config.focused);
  }

  async display(target?: string) {
    this.operations.push(`display:${target ?? "start"}`);
    await this.config.displayGate?.promise;
    if (this.config.rejectTarget && target) throw new Error("Malformed CFI");
    this.page = pageFromTarget(target);
    return locator(this.page);
  }

  async turn(direction: EpubTurnDirection) {
    this.operations.push(direction);
    this.page += direction === "next" ? 1 : -1;
    return locator(this.page);
  }

  async snapshot() {
    this.operations.push("snapshot");
    return locator(this.page);
  }

  async isAnchorVisible(cfi: string) {
    this.operations.push(`visible:${cfi}`);
    await this.config.visibilityGates?.shift()?.promise;
    const sequenced = this.config.visibleSequence?.shift();
    if (sequenced !== undefined) return sequenced;
    return this.config.visible ?? pageFromTarget(cfi) === this.page;
  }

  async isPresentable() {
    return this.config.presentable ?? true;
  }

  hasFocus() {
    this.operations.push("hasFocus");
    return this.focused;
  }

  focus() {
    this.focused = true;
    this.focusCalls += 1;
    this.operations.push("focus");
  }

  destroy() {
    this.destroyed = true;
    this.operations.push("destroy");
  }
}

function harness() {
  const renderers: Array<{ slot: EpubRendererSlot; renderer: FakeRenderer }> = [];
  const commits: EpubCommit[] = [];
  const errors: unknown[] = [];
  const states = new Map<EpubRendererSlot, EpubRendererSlotState>();
  const visualLog: string[] = [];
  const busy: boolean[] = [];
  const navigator = new EpubNavigator<Config>({
    createRenderer(slot, config) {
      const renderer = new FakeRenderer(config);
      renderers.push({ slot, renderer });
      return renderer;
    },
    setSlotState(slot, state) {
      states.set(slot, state);
      visualLog.push(`${slot}:${state}`);
    },
    onCommit(commit) {
      commits.push(commit);
    },
    async prepareSlotForCommit(_slot, renderer) {
      await (renderer as FakeRenderer).config.prepareGate?.promise;
    },
    onBusyChange(value) {
      busy.push(value);
    },
    onError(failure) {
      errors.push(failure);
    },
  });
  return { navigator, renderers, commits, errors, states, visualLog, busy };
}

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error("Condition did not settle");
}

async function initializeAt(result: ReturnType<typeof harness>, page = 27) {
  result.navigator.initialize({
    config: { name: "initial" },
    anchor: `epubcfi(/6/${page})`,
    validateAnchor: true,
  });
  await result.navigator.whenIdle();
}

describe("EPUB frame sizing", () => {
  it("uses only positive integer viewport dimensions", () => {
    expect(epubFrameSize({ width: 900.8, height: 620.9 })).toEqual({ width: 900, height: 620 });
    expect(epubFrameSize({ width: 0, height: 620 })).toBeNull();
    expect(sameEpubFrameSize({ width: 900, height: 620 }, { width: 900, height: 620 })).toBe(true);
    expect(sameEpubFrameSize({ width: 900, height: 620 }, { width: 901, height: 620 })).toBe(false);
  });

  it("keeps a committed spread readable while the viewport contracts", () => {
    expect(epubRendererFitScale(
      { width: 600, height: 800 },
      { width: 1100, height: 700 },
    )).toBe(600 / 1100);
    expect(epubRendererFitScale(
      { width: 1200, height: 900 },
      { width: 900, height: 700 },
    )).toBe(1);
  });

  it("requests only the final stable viewport in a resize burst", () => {
    const stability = new EpubViewportStability(2);
    stability.markRequested({ width: 800, height: 600 });
    stability.markCommitted({ width: 800, height: 600 });

    expect(stability.sample({ width: 900, height: 600 }).state).toBe("wait");
    expect(stability.sample({ width: 1024, height: 700 }).state).toBe("wait");
    expect(stability.sample({ width: 1365, height: 768 }).state).toBe("wait");
    expect(stability.sample({ width: 1365, height: 768 })).toEqual({
      state: "request",
      size: { width: 1365, height: 768 },
    });
    expect(stability.sample({ width: 1365, height: 768 }).state).toBe("unchanged");
  });

  it("supersedes an in-flight viewport when orientation returns to the committed size", () => {
    const stability = new EpubViewportStability(2);
    stability.markRequested({ width: 800, height: 600 });
    stability.markCommitted({ width: 800, height: 600 });
    stability.markRequested({ width: 1365, height: 768 });

    expect(stability.sample({ width: 800, height: 600 }).state).toBe("wait");
    expect(stability.sample({ width: 800, height: 600 })).toEqual({
      state: "request",
      size: { width: 800, height: 600 },
    });
  });

  it("allows a failed viewport request to be sampled again", () => {
    const stability = new EpubViewportStability(2);
    stability.markRequested({ width: 800, height: 600 });
    stability.markCommitted({ width: 800, height: 600 });
    stability.markRequested({ width: 1200, height: 700 });
    stability.markRejected();

    expect(stability.sample({ width: 1200, height: 700 }).state).toBe("wait");
    expect(stability.sample({ width: 1200, height: 700 }).state).toBe("request");
  });

  it("derives measurable geometry from a collapsed character CFI without mutating the source range", () => {
    const measured = { top: 22, right: 110, bottom: 42, left: 100, width: 10, height: 20 } as DOMRect;
    const zero = { top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0 } as DOMRect;
    const text = { nodeType: 3, textContent: "anchor" } as Text;
    const operations: string[] = [];
    const clone = {
      setStart(_node: Node, offset: number) { operations.push(`start:${offset}`); },
      setEnd(_node: Node, offset: number) { operations.push(`end:${offset}`); },
      getClientRects() { return [measured]; },
      getBoundingClientRect() { return measured; },
    } as unknown as Range;
    const source = {
      collapsed: true,
      startContainer: text,
      startOffset: 2,
      getClientRects() { return []; },
      getBoundingClientRect() { return zero; },
      cloneRange() { return clone; },
    } as unknown as Range;

    expect(epubAnchorClientRects(source)).toEqual([measured]);
    expect(operations).toEqual(["end:3"]);
  });

  it("translates iframe-local CFI geometry before viewport validation", () => {
    const host = { top: 100, right: 900, bottom: 700, left: 100 };
    const iframe = { top: 120, left: 140 };
    expect(epubContentRectIsVisible(
      { top: 40, right: 280, bottom: 70, left: 180 },
      iframe,
      host,
    )).toBe(true);
    expect(epubContentRectIsVisible(
      { top: 900, right: 280, bottom: 930, left: 180 },
      iframe,
      host,
    )).toBe(false);
  });

  it("routes only same-publication links through the atomic navigator", () => {
    expect(epubNavigationTargetFromLink({
      rawHref: "chapter-2.xhtml#note-1",
      currentPublicationHref: "OPS/text/chapter-1.xhtml",
    })).toBe("OPS/text/chapter-2.xhtml#note-1");
    expect(epubNavigationTargetFromLink({
      rawHref: "#note-1",
      currentPublicationHref: "OPS/text/chapter-1.xhtml",
    })).toBe("OPS/text/chapter-1.xhtml#note-1");
    expect(epubNavigationTargetFromLink({
      rawHref: "../notes.xhtml?view=compact#note-1",
      currentPublicationHref: "OPS/text/chapter-1.xhtml",
    })).toBe("OPS/notes.xhtml?view=compact#note-1");
    expect(epubNavigationTargetFromLink({
      rawHref: "/OPS/text/chapter-3.xhtml",
      currentPublicationHref: "OPS/text/chapter-1.xhtml",
    })).toBe("OPS/text/chapter-3.xhtml");
    expect(epubNavigationTargetFromLink({
      rawHref: "epubcfi(/6/42)",
      currentPublicationHref: "OPS/text/chapter-1.xhtml",
    })).toBe("epubcfi(/6/42)");
    expect(epubNavigationTargetFromLink({
      rawHref: "https://example.com/reference",
      currentPublicationHref: "OPS/text/chapter-1.xhtml",
    })).toBeNull();
    expect(epubNavigationTargetFromLink({
      rawHref: "//example.com/reference",
      currentPublicationHref: "OPS/text/chapter-1.xhtml",
    })).toBeNull();
    expect(epubNavigationTargetFromLink({
      rawHref: "javascript:alert(1)",
      currentPublicationHref: "OPS/text/chapter-1.xhtml",
    })).toBeNull();
    expect(epubNavigationTargetFromLink({
      rawHref: "chapter-2.xhtml",
      currentPublicationHref: null,
    })).toBeNull();
  });
});

describe("EPUB media layout signatures", () => {
  it("commits staging observations without triggering a duplicate active reflow", () => {
    const tracker = new EpubLayoutSignatureTracker();
    const staging = new Set<string>();
    expect(tracker.observe(staging, "chapter|image|640x480", false)).toBe(false);
    tracker.commit(staging);

    const active = new Set<string>();
    expect(tracker.observe(active, "chapter|image|640x480", true)).toBe(false);
  });

  it("does not let abandoned staging work suppress the active renderer", () => {
    const tracker = new EpubLayoutSignatureTracker();
    const stale = new Set<string>();
    expect(tracker.observe(stale, "chapter|video|1920x1080", false)).toBe(false);

    const active = new Set<string>();
    expect(tracker.observe(active, "chapter|video|1920x1080", true)).toBe(true);
    expect(tracker.observe(active, "chapter|video|1920x1080", true)).toBe(false);
  });
});

describe("EpubNavigator atomic rendering", () => {
  it("keeps the initial renderer hidden until its exact anchor is ready and painted", async () => {
    const result = harness();
    const displayGate = deferred<void>();
    const prepareGate = deferred<void>();
    result.navigator.initialize({
      config: { name: "initial", displayGate, prepareGate },
      anchor: "epubcfi(/6/27)",
      validateAnchor: true,
    });
    await waitFor(() => result.renderers.length === 1);

    expect(result.states.get(0)).toBe("staging");
    expect([...result.states.values()]).not.toContain("active");
    expect(result.commits).toHaveLength(0);

    displayGate.resolve();
    await waitFor(() => result.states.get(0) === "ready");
    expect(result.commits).toHaveLength(0);

    prepareGate.resolve();
    await result.navigator.whenIdle();

    expect(result.states.get(0)).toBe("active");
    expect(result.commits.map((commit) => commit.locator.cfi)).toEqual(["epubcfi(/6/27)"]);
    expect(result.renderers[0].renderer.operations).toContain("visible:epubcfi(/6/27)");
  });

  it("retains the readable frame until one atomic reflow swap", async () => {
    const result = harness();
    await initializeAt(result);
    const old = result.renderers[0].renderer;
    const displayGate = deferred<void>();
    const prepareGate = deferred<void>();

    result.navigator.requestReflow({
      config: { name: "font-21", fontSize: 21, displayGate, prepareGate },
      anchor: "epubcfi(/6/27)",
      cause: "appearance",
      validateAnchor: true,
    });
    await waitFor(() => result.renderers.length === 2);

    expect(result.states.get(0)).toBe("active");
    expect(result.states.get(1)).toBe("staging");
    expect(old.destroyed).toBe(false);
    expect(result.commits).toHaveLength(1);

    displayGate.resolve();
    await waitFor(() => result.states.get(1) === "ready");
    expect(result.states.get(0)).toBe("active");
    expect(old.destroyed).toBe(false);
    expect(result.commits).toHaveLength(1);

    prepareGate.resolve();
    await result.navigator.whenIdle();

    expect(result.commits).toHaveLength(2);
    expect(result.commits[1]).toMatchObject({
      cause: "appearance",
      atomic: true,
      locator: { cfi: "epubcfi(/6/27)" },
    });
    const activeIndex = result.visualLog.lastIndexOf("1:active");
    const inactiveIndex = result.visualLog.lastIndexOf("0:inactive");
    expect(activeIndex).toBeLessThan(inactiveIndex);
    expect(old.destroyed).toBe(true);
  });

  it("rejects a late prepaint layout shift without exposing or destroying the old frame", async () => {
    const result = harness();
    await initializeAt(result, 27);
    const old = result.renderers[0].renderer;

    result.navigator.requestReflow({
      config: { name: "late-media-shift", visibleSequence: [true, false] },
      anchor: "epubcfi(/6/27)",
      cause: "media",
      validateAnchor: true,
    });
    await result.navigator.whenIdle();

    expect(result.navigator.getActiveRenderer()).toBe(old);
    expect(old.destroyed).toBe(false);
    expect(result.renderers[1].renderer.destroyed).toBe(true);
    expect(result.visualLog).toContain("1:ready");
    expect(result.visualLog).not.toContain("1:active");
    expect(result.states.get(0)).toBe("active");
    expect(result.states.get(1)).toBe("inactive");
    expect((result.errors[0] as { error: unknown }).error).toBeInstanceOf(EpubAnchorNotVisibleError);
  });

  it("transfers browsing-context focus only after the replacement commits", async () => {
    const result = harness();
    result.navigator.initialize({
      config: { name: "focused-initial", focused: true },
      anchor: "epubcfi(/6/27)",
      validateAnchor: true,
    });
    await result.navigator.whenIdle();
    const old = result.renderers[0].renderer;

    result.navigator.requestReflow({
      config: { name: "focused-replacement" },
      anchor: "epubcfi(/6/27)",
      cause: "viewport",
      validateAnchor: true,
    });
    await result.navigator.whenIdle();

    const replacement = result.renderers[1].renderer;
    expect(old.operations).toContain("hasFocus");
    expect(replacement.focusCalls).toBe(1);
    expect(replacement.focused).toBe(true);
    expect(replacement.operations.indexOf("focus")).toBeGreaterThan(
      replacement.operations.lastIndexOf("visible:epubcfi(/6/27)"),
    );
    expect(old.destroyed).toBe(true);
  });

  it("applies rapid page turns during reflow in order before committing", async () => {
    const result = harness();
    await initializeAt(result, 27);
    const gate = deferred<void>();

    result.navigator.requestReflow({
      config: { name: "fullscreen", width: 1280, height: 720, displayGate: gate },
      anchor: "epubcfi(/6/27)",
      cause: "viewport",
    });
    await waitFor(() => result.renderers.length === 2);
    result.navigator.turn("next");
    result.navigator.turn("next");
    result.navigator.turn("prev");

    gate.resolve();
    await result.navigator.whenIdle();

    expect(result.renderers[1].renderer.operations).toEqual([
      "display:epubcfi(/6/27)",
      "visible:epubcfi(/6/27)",
      "next",
      "next",
      "prev",
      "snapshot",
    ]);
    expect(result.commits).toHaveLength(2);
    expect(result.commits[1]).toMatchObject({
      cause: "page-turn",
      userInitiated: true,
      atomic: true,
      locator: { cfi: "epubcfi(/6/28)" },
    });
  });

  it("does not lose page turns received during the prepaint barrier", async () => {
    const result = harness();
    await initializeAt(result, 27);
    const prepareGate = deferred<void>();

    result.navigator.requestReflow({
      config: { name: "prepaint-turns", prepareGate },
      anchor: "epubcfi(/6/27)",
      cause: "viewport",
    });
    await waitFor(() => result.states.get(1) === "ready");
    result.navigator.turn("next");
    result.navigator.turn("next");
    prepareGate.resolve();
    await result.navigator.whenIdle();

    expect(result.renderers[1].renderer.operations).toEqual([
      "display:epubcfi(/6/27)",
      "visible:epubcfi(/6/27)",
      "snapshot",
      "next",
      "next",
      "snapshot",
    ]);
    expect(result.commits.at(-1)).toMatchObject({
      cause: "page-turn",
      anchor: "epubcfi(/6/29)",
      locator: { cfi: "epubcfi(/6/29)" },
    });
  });

  it("does not lose a page turn received during final anchor validation", async () => {
    const result = harness();
    await initializeAt(result, 27);
    const validationGate = deferred<void>();

    result.navigator.requestReflow({
      config: { name: "validation-turn", visibilityGates: [undefined, validationGate] },
      anchor: "epubcfi(/6/27)",
      cause: "appearance",
    });
    await waitFor(() => result.renderers[1]?.renderer.operations.filter((operation) => operation.startsWith("visible:")).length === 2);
    result.navigator.turn("next");
    validationGate.resolve();
    await result.navigator.whenIdle();

    expect(result.renderers[1].renderer.operations.slice(-4)).toEqual([
      "snapshot",
      "visible:epubcfi(/6/27)",
      "next",
      "snapshot",
    ]);
    expect(result.commits.at(-1)).toMatchObject({
      cause: "page-turn",
      locator: { cfi: "epubcfi(/6/28)" },
    });
  });

  it("carries page turns across a superseded resize transition", async () => {
    const result = harness();
    await initializeAt(result, 27);
    const staleGate = deferred<void>();

    result.navigator.requestReflow({
      config: { name: "first-resize", displayGate: staleGate },
      anchor: "epubcfi(/6/27)",
      cause: "viewport",
    });
    await waitFor(() => result.renderers.length === 2);
    result.navigator.turn("next");
    result.navigator.requestReflow({
      config: { name: "final-resize", width: 1365, height: 768 },
      anchor: "epubcfi(/6/27)",
      cause: "viewport",
    });
    result.navigator.turn("next");
    result.navigator.turn("prev");
    staleGate.resolve();
    await result.navigator.whenIdle();

    expect(result.renderers).toHaveLength(3);
    expect(result.renderers[2].renderer.operations).toEqual([
      "display:epubcfi(/6/27)",
      "visible:epubcfi(/6/27)",
      "next",
      "next",
      "prev",
      "snapshot",
    ]);
    expect(result.commits.at(-1)).toMatchObject({
      cause: "page-turn",
      anchor: "epubcfi(/6/28)",
      locator: { cfi: "epubcfi(/6/28)" },
    });
  });

  it("lets a higher-fidelity selection CFI replace an inferred reflow anchor", async () => {
    const result = harness();
    await initializeAt(result, 27);
    const staleGate = deferred<void>();

    result.navigator.requestReflow({
      config: { name: "inferred", displayGate: staleGate },
      anchor: "epubcfi(/6/27)",
      cause: "viewport",
    });
    await waitFor(() => result.renderers.length === 2);
    result.navigator.requestReflow({
      config: { name: "selection" },
      anchor: "epubcfi(/6/29)",
      cause: "appearance",
      replaceAnchor: true,
    });
    staleGate.resolve();
    await result.navigator.whenIdle();

    expect(result.renderers[2].renderer.operations[0]).toBe("display:epubcfi(/6/29)");
    expect(result.commits.at(-1)).toMatchObject({
      anchor: "epubcfi(/6/29)",
      locator: { cfi: "epubcfi(/6/29)" },
    });
  });

  it("lets a later selection supersede an uncommitted absolute destination", async () => {
    const result = harness();
    await initializeAt(result, 27);
    const staleGate = deferred<void>();

    result.navigator.navigate({
      config: { name: "toc", displayGate: staleGate },
      anchor: "epubcfi(/6/27)",
      target: "epubcfi(/6/75)",
      cause: "toc",
      userInitiated: true,
    });
    await waitFor(() => result.renderers.length === 2);
    result.navigator.turn("next");
    result.navigator.requestReflow({
      config: { name: "selection" },
      anchor: "epubcfi(/6/29)",
      cause: "appearance",
      replaceAnchor: true,
    });
    result.navigator.turn("prev");
    staleGate.resolve();
    await result.navigator.whenIdle();

    expect(result.renderers[2].renderer.operations).toEqual([
      "display:epubcfi(/6/29)",
      "visible:epubcfi(/6/29)",
      "prev",
      "snapshot",
    ]);
    expect(result.commits.at(-1)).toMatchObject({
      cause: "page-turn",
      anchor: "epubcfi(/6/28)",
      locator: { cfi: "epubcfi(/6/28)" },
    });
  });

  it("lets only the final viewport burst commit", async () => {
    const result = harness();
    await initializeAt(result);

    for (const [width, height] of [[800, 600], [1024, 700], [1365, 768]] as const) {
      result.navigator.requestReflow({
        config: { name: `${width}x${height}`, width, height },
        anchor: "epubcfi(/6/27)",
        cause: "viewport",
      });
    }
    await result.navigator.whenIdle();

    expect(result.renderers).toHaveLength(2);
    expect(result.renderers[1].renderer.config).toMatchObject({ width: 1365, height: 768 });
    expect(result.commits).toHaveLength(2);
  });

  it.each([
    ["font size", { fontSize: 21 }],
    ["line height", { lineHeight: 1.9 }],
    ["page width", { pageWidth: 860 }],
    ["theme", { theme: "night" }],
  ])("preserves the CFI for a %s change", async (_label, change) => {
    const result = harness();
    await initializeAt(result, 41);
    result.navigator.requestReflow({
      config: { name: "appearance", ...change },
      anchor: "epubcfi(/6/41)",
      cause: "appearance",
    });
    await result.navigator.whenIdle();

    expect(result.navigator.getCommittedLocator()?.cfi).toBe("epubcfi(/6/41)");
    expect(result.renderers[1].renderer.operations).toContain("visible:epubcfi(/6/41)");
  });

  it("treats an intrinsic media resize as an anchor-preserving reflow", async () => {
    const result = harness();
    await initializeAt(result, 52);
    result.navigator.requestReflow({
      config: { name: "media-ready", mediaRevision: 4 },
      anchor: "epubcfi(/6/52)",
      cause: "media",
    });
    await result.navigator.whenIdle();

    expect(result.commits.at(-1)).toMatchObject({
      cause: "media",
      userInitiated: false,
      locator: { cfi: "epubcfi(/6/52)" },
    });
  });

  it("discards a stale async renderer and commits only the newer reflow", async () => {
    const result = harness();
    await initializeAt(result, 27);
    const staleGate = deferred<void>();

    result.navigator.requestReflow({
      config: { name: "stale-font", fontSize: 19, displayGate: staleGate },
      anchor: "epubcfi(/6/27)",
      cause: "appearance",
    });
    await waitFor(() => result.renderers.length === 2);
    result.navigator.requestReflow({
      config: { name: "final-font", fontSize: 21 },
      anchor: "epubcfi(/6/27)",
      cause: "appearance",
    });
    staleGate.resolve();
    await result.navigator.whenIdle();

    expect(result.renderers).toHaveLength(3);
    expect(result.renderers[1].renderer.destroyed).toBe(true);
    expect(result.renderers[2].renderer.config.name).toBe("final-font");
    expect(result.commits.map((commit) => commit.locator.cfi)).toEqual([
      "epubcfi(/6/27)",
      "epubcfi(/6/27)",
    ]);
  });

  it("uses the post-turn locator when a queued reflow follows navigation", async () => {
    const result = harness();
    await initializeAt(result, 27);
    result.navigator.turn("next");
    result.navigator.requestReflow({
      config: { name: "after-turn", lineHeight: 1.9 },
      anchor: "epubcfi(/6/27)",
      cause: "appearance",
    });
    await result.navigator.whenIdle();

    expect(result.renderers[1].renderer.operations[0]).toBe("display:epubcfi(/6/28)");
    expect(result.navigator.getCommittedLocator()?.cfi).toBe("epubcfi(/6/28)");
  });

  it("handles TOC and percentage targets through the same atomic path", async () => {
    const result = harness();
    await initializeAt(result, 27);
    result.navigator.navigate({
      config: { name: "toc" },
      anchor: "epubcfi(/6/27)",
      target: "epubcfi(/6/75)",
      cause: "toc",
      userInitiated: true,
    });
    await result.navigator.whenIdle();

    expect(result.commits.at(-1)).toMatchObject({
      cause: "toc",
      userInitiated: true,
      atomic: true,
      locator: { cfi: "epubcfi(/6/75)" },
    });
  });

  it("handles internal publication links through the same atomic path", async () => {
    const result = harness();
    await initializeAt(result, 27);
    result.navigator.navigate({
      config: { name: "internal-link" },
      anchor: "epubcfi(/6/27)",
      target: "chapter-8.xhtml#note-3",
      cause: "link",
      userInitiated: true,
      validateAnchor: false,
    });
    await result.navigator.whenIdle();

    expect(result.commits.at(-1)).toMatchObject({
      cause: "link",
      userInitiated: true,
      atomic: true,
    });
    expect(result.renderers[1].renderer.operations[0]).toBe("display:chapter-8.xhtml#note-3");
  });

  it("coalesces queued absolute destinations so only the final target is exposed", async () => {
    const result = harness();
    await initializeAt(result, 27);

    result.navigator.navigate({
      config: { name: "first-toc" },
      anchor: "epubcfi(/6/27)",
      target: "epubcfi(/6/50)",
      cause: "toc",
      userInitiated: true,
    });
    result.navigator.navigate({
      config: { name: "final-toc" },
      anchor: "epubcfi(/6/27)",
      target: "epubcfi(/6/75)",
      cause: "toc",
      userInitiated: true,
    });
    await result.navigator.whenIdle();

    expect(result.renderers).toHaveLength(2);
    expect(result.renderers[1].renderer.config.name).toBe("final-toc");
    expect(result.renderers[1].renderer.operations[0]).toBe("display:epubcfi(/6/75)");
    expect(result.commits.map((commit) => commit.locator.cfi)).toEqual([
      "epubcfi(/6/27)",
      "epubcfi(/6/75)",
    ]);
  });

  it("preserves an in-flight absolute destination when a resize arrives", async () => {
    const result = harness();
    await initializeAt(result, 27);
    const gate = deferred<void>();

    result.navigator.navigate({
      config: { name: "toc-before-resize", displayGate: gate },
      anchor: "epubcfi(/6/27)",
      target: "epubcfi(/6/75)",
      cause: "toc",
      userInitiated: true,
    });
    await waitFor(() => result.renderers.length === 2);
    result.navigator.requestReflow({
      config: { name: "toc-after-resize", width: 1365, height: 768 },
      anchor: "epubcfi(/6/27)",
      cause: "viewport",
    });
    gate.resolve();
    await result.navigator.whenIdle();

    expect(result.renderers).toHaveLength(3);
    expect(result.renderers[2].renderer.config.name).toBe("toc-after-resize");
    expect(result.renderers[2].renderer.operations[0]).toBe("display:epubcfi(/6/75)");
    expect(result.commits.at(-1)).toMatchObject({
      cause: "toc",
      anchor: "epubcfi(/6/75)",
      locator: { cfi: "epubcfi(/6/75)" },
    });
  });

  it("preserves initial fallback semantics when viewport churn supersedes startup", async () => {
    const result = harness();
    const gate = deferred<void>();
    result.navigator.initialize({
      config: { name: "initial-before-resize", displayGate: gate },
      anchor: "epubcfi(/6/27)",
      validateAnchor: true,
      allowStartFallback: true,
    });
    await waitFor(() => result.renderers.length === 1);
    result.navigator.requestReflow({
      config: { name: "initial-after-resize", width: 1024, height: 700 },
      anchor: "epubcfi(/6/27)",
      cause: "viewport",
    });
    gate.resolve();
    await result.navigator.whenIdle();

    expect(result.renderers).toHaveLength(2);
    expect(result.renderers[1].renderer.config.name).toBe("initial-after-resize");
    expect(result.commits).toHaveLength(1);
    expect(result.commits[0]).toMatchObject({ cause: "initial", anchor: "epubcfi(/6/27)" });
  });

  it("falls back once when a startup CFI displays but is not actually visible", async () => {
    const result = harness();
    result.navigator.initialize({
      config: { name: "misplaced-start", visibleSequence: [false, true] },
      anchor: "epubcfi(/6/27)",
      validateAnchor: true,
      allowStartFallback: true,
    });
    await result.navigator.whenIdle();

    expect(result.renderers).toHaveLength(2);
    expect(result.renderers[0].renderer.operations).toEqual([
      "display:epubcfi(/6/27)",
      "visible:epubcfi(/6/27)",
      "destroy",
    ]);
    expect(result.renderers[1].renderer.operations).toEqual([
      "display:start",
      "snapshot",
    ]);
    expect(result.commits[0]).toMatchObject({
      cause: "initial",
      anchor: "epubcfi(/6/0)",
    });
  });

  it("falls back once to publication start for a malformed startup CFI", async () => {
    const result = harness();
    result.navigator.initialize({
      config: { name: "malformed-start", rejectTarget: true },
      anchor: "epubcfi(/6/999)",
      validateAnchor: true,
      allowStartFallback: true,
    });
    await result.navigator.whenIdle();

    expect(result.renderers).toHaveLength(2);
    expect(result.renderers[0].renderer.operations).toEqual([
      "display:epubcfi(/6/999)",
      "destroy",
    ]);
    expect(result.renderers[1].renderer.operations).toEqual([
      "display:start",
      "snapshot",
    ]);
    expect(result.commits[0]).toMatchObject({
      cause: "initial",
      anchor: "epubcfi(/6/0)",
      locator: { cfi: "epubcfi(/6/0)" },
    });
  });

  it("commits an image-only publication start through presentation without claiming an exact restore", async () => {
    const result = harness();
    result.navigator.initialize({
      config: { name: "image-cover", visible: false, presentable: true },
      anchor: null,
      validateAnchor: false,
      allowStartFallback: true,
    });
    await result.navigator.whenIdle();

    expect(result.commits).toHaveLength(1);
    expect(result.commits[0]).toMatchObject({
      cause: "initial",
      anchor: "epubcfi(/6/0)",
      exactAnchorValidated: false,
    });
    expect(result.errors).toHaveLength(0);
  });

  it("uses one fresh publication-start renderer when a saved CFI fails the late commit check", async () => {
    const result = harness();
    result.navigator.initialize({
      config: { name: "late-start-fallback", visibleSequence: [true, false], presentable: true },
      anchor: "epubcfi(/6/27)",
      validateAnchor: true,
      allowStartFallback: true,
    });
    await result.navigator.whenIdle();

    expect(result.renderers).toHaveLength(2);
    expect(result.renderers[0].renderer.destroyed).toBe(true);
    expect(result.renderers[1].renderer.operations[0]).toBe("display:start");
    expect(result.commits[0]).toMatchObject({
      cause: "initial",
      anchor: "epubcfi(/6/0)",
      exactAnchorValidated: false,
    });
  });

  it("reports a typed presentation failure instead of committing a blank publication start", async () => {
    const result = harness();
    result.navigator.initialize({
      config: { name: "blank-start", presentable: false },
      anchor: null,
      validateAnchor: false,
      allowStartFallback: true,
    });
    await result.navigator.whenIdle();

    expect(result.commits).toHaveLength(0);
    expect((result.errors[0] as { error: unknown }).error).toBeInstanceOf(EpubPresentationNotVisibleError);
  });

  it("keeps the old frame when an exact destination CFI is not visible", async () => {
    const result = harness();
    await initializeAt(result, 27);
    const old = result.navigator.getActiveRenderer();

    result.navigator.navigate({
      config: { name: "bad-destination", visible: false },
      anchor: "epubcfi(/6/27)",
      target: "epubcfi(/6/75)",
      cause: "reference",
      validateAnchor: true,
    });
    await result.navigator.whenIdle();

    expect(result.navigator.getActiveRenderer()).toBe(old);
    expect(result.navigator.getCommittedLocator()?.cfi).toBe("epubcfi(/6/27)");
    expect(result.errors).toHaveLength(1);
  });

  it("validates the source before queued turns and replays input on the retained frame after failure", async () => {
    const result = harness();
    await initializeAt(result, 27);
    const gate = deferred<void>();

    result.navigator.requestReflow({
      config: { name: "wrong-source", visible: false, displayGate: gate },
      anchor: "epubcfi(/6/27)",
      cause: "appearance",
    });
    await waitFor(() => result.renderers.length === 2);
    result.navigator.turn("next");
    gate.resolve();
    await result.navigator.whenIdle();

    expect(result.renderers[1].renderer.operations).toEqual([
      "display:epubcfi(/6/27)",
      "visible:epubcfi(/6/27)",
      "destroy",
    ]);
    expect(result.renderers[0].renderer.operations).toContain("next");
    expect(result.commits.at(-1)).toMatchObject({
      cause: "page-turn",
      locator: { cfi: "epubcfi(/6/28)" },
    });
    expect(result.errors).toHaveLength(1);
  });

  it("keeps the old frame when a renderer cannot validate the source anchor", async () => {
    const result = harness();
    await initializeAt(result, 27);
    const old = result.navigator.getActiveRenderer();

    result.navigator.requestReflow({
      config: { name: "bad-cfi", visible: false },
      anchor: "epubcfi(/6/27)",
      cause: "appearance",
    });
    await result.navigator.whenIdle();

    expect(result.navigator.getActiveRenderer()).toBe(old);
    expect(result.states.get(0)).toBe("active");
    expect(result.states.get(1)).toBe("inactive");
    expect(result.errors).toHaveLength(1);
    expect((result.errors[0] as { error: unknown }).error).toBeInstanceOf(EpubAnchorNotVisibleError);
    expect((result.errors[0] as { retainedReadableFrame: boolean }).retainedReadableFrame).toBe(true);
  });

  it("destroys both active and staging renderers on cleanup", async () => {
    const result = harness();
    await initializeAt(result, 27);
    const gate = deferred<void>();
    result.navigator.requestReflow({
      config: { name: "pending", displayGate: gate },
      anchor: "epubcfi(/6/27)",
      cause: "viewport",
    });
    await waitFor(() => result.renderers.length === 2);

    result.navigator.dispose();
    gate.resolve();
    await Promise.resolve();

    expect(result.renderers.every(({ renderer }) => renderer.destroyed)).toBe(true);
    expect(result.renderers.map(({ renderer }) => renderer.operations.filter((operation) => operation === "destroy").length))
      .toEqual([1, 1]);
    expect(result.states.get(0)).toBe("inactive");
    expect(result.states.get(1)).toBe("inactive");
  });
});
