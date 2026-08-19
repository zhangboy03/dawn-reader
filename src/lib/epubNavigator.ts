export type EpubFrameSize = { width: number; height: number };
export type EpubRendererSlot = 0 | 1;
export type EpubRendererSlotState = "active" | "ready" | "staging" | "inactive";
export type EpubTurnDirection = "next" | "prev";
export type EpubNavigationCause =
  | "initial"
  | "appearance"
  | "viewport"
  | "media"
  | "page-turn"
  | "percentage"
  | "toc"
  | "link"
  | "reference";

export type EpubLocator = {
  cfi: string | null;
  href: string;
  percentage: number | null;
};

export interface EpubRenderer {
  display(target?: string): Promise<EpubLocator>;
  turn(direction: EpubTurnDirection): Promise<EpubLocator>;
  snapshot(): Promise<EpubLocator>;
  isAnchorVisible(cfi: string): Promise<boolean>;
  /** True when keyboard/accessibility focus currently lives in this renderer's browsing context. */
  hasFocus?(): boolean;
  /** Restore browsing-context focus after an atomic renderer swap without scrolling the host page. */
  focus?(): void;
  destroy(): void;
}

export type EpubAtomicRequest<Config> = {
  kind: "initial" | "reflow" | "navigate";
  config: Config;
  anchor: string | null;
  target?: string | null;
  cause: Exclude<EpubNavigationCause, "page-turn">;
  userInitiated?: boolean;
  validateAnchor?: boolean;
  allowStartFallback?: boolean;
  /** Use only when a newer, higher-fidelity source anchor (for example a selection CFI) supersedes an inferred visible locator. */
  replaceAnchor?: boolean;
};

export type EpubCommit = {
  slot: EpubRendererSlot;
  previousSlot: EpubRendererSlot | null;
  renderer: EpubRenderer;
  locator: EpubLocator;
  /** Stable source anchor used for exact persistence; page lists remain display-only. */
  anchor: string | null;
  cause: EpubNavigationCause;
  userInitiated: boolean;
  atomic: boolean;
};

export type EpubNavigationError = {
  cause: EpubNavigationCause;
  error: unknown;
  retainedReadableFrame: boolean;
};

export type EpubNavigatorOptions<Config> = {
  createRenderer: (slot: EpubRendererSlot, config: Config) => Promise<EpubRenderer> | EpubRenderer;
  setSlotState: (slot: EpubRendererSlot, state: EpubRendererSlotState) => void;
  onCommit: (commit: EpubCommit) => void;
  /** Called after a validated renderer is exposed beneath the active frame, allowing one real paint before the atomic swap. */
  prepareSlotForCommit?: (slot: EpubRendererSlot, renderer: EpubRenderer) => Promise<void> | void;
  onBusyChange?: (busy: boolean) => void;
  onError?: (failure: EpubNavigationError) => void;
  schedule?: (task: () => void) => void;
};

type AtomicCommand<Config> = EpubAtomicRequest<Config> & {
  type: "atomic";
  baseNavigationEpoch: number;
  turns: EpubTurnDirection[];
};

type TurnCommand = {
  type: "turn";
  direction: EpubTurnDirection;
};

type Command<Config> = AtomicCommand<Config> | TurnCommand;

type ActiveRenderer = {
  slot: EpubRendererSlot;
  renderer: EpubRenderer;
};

type Transition<Config> = {
  token: number;
  request: AtomicCommand<Config>;
  slot: EpubRendererSlot;
  renderer: EpubRenderer | null;
  turns: EpubTurnDirection[];
  appliedTurns: number;
  cancelled: boolean;
};

export class EpubAnchorNotVisibleError extends Error {
  constructor(readonly cfi: string) {
    super(`EPUB anchor is not visible after layout: ${cfi}`);
    this.name = "EpubAnchorNotVisibleError";
  }
}

export function epubFrameSize(rect: Pick<DOMRectReadOnly, "width" | "height">): EpubFrameSize | null {
  const width = Math.floor(rect.width);
  const height = Math.floor(rect.height);
  return width > 0 && height > 0 ? { width, height } : null;
}

export function sameEpubFrameSize(left: EpubFrameSize | null, right: EpubFrameSize | null) {
  return Boolean(left && right && left.width === right.width && left.height === right.height);
}

/** Keeps a committed fixed-geometry renderer readable while its viewport contracts. */
export function epubRendererFitScale(frame: EpubFrameSize, renderer: EpubFrameSize) {
  if (frame.width <= 0 || frame.height <= 0 || renderer.width <= 0 || renderer.height <= 0) return 1;
  return Math.min(1, frame.width / renderer.width, frame.height / renderer.height);
}

type EpubLinkTargetInput = {
  rawHref: string | null;
  currentPublicationHref: string | null;
};

const EPUB_LINK_RESOLUTION_ORIGIN = "https://dawn-publication.invalid";

/**
 * Resolves an authored same-publication link from the current spine href, not
 * from the iframe's browser/blob URL. This matches EPUB path semantics while
 * leaving network, application, download, and new-window links browser-owned.
 */
export function epubNavigationTargetFromLink({
  rawHref,
  currentPublicationHref,
}: EpubLinkTargetInput): string | null {
  const raw = rawHref?.trim() ?? "";
  if (!raw) return null;
  if (raw.startsWith("epubcfi(")) return raw;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//")) return null;

  const current = currentPublicationHref?.trim() ?? "";
  if (!current) return null;
  try {
    // Normalize even an accidentally absolute current href back to its
    // publication path before resolving the authored relative reference.
    const currentUrl = new URL(current, `${EPUB_LINK_RESOLUTION_ORIGIN}/`);
    const publicationBase = new URL(
      `${currentUrl.pathname.replace(/^\/+/, "")}${currentUrl.search}${currentUrl.hash}`,
      `${EPUB_LINK_RESOLUTION_ORIGIN}/`,
    );
    const target = new URL(raw, publicationBase);
    if (target.origin !== EPUB_LINK_RESOLUTION_ORIGIN) return null;
    const href = `${target.pathname.replace(/^\/+/, "")}${target.search}${target.hash}`;
    return href || null;
  } catch {
    return null;
  }
}

export type EpubViewportSample =
  | { state: "unchanged"; size: EpubFrameSize }
  | { state: "wait"; size: EpubFrameSize }
  | { state: "request"; size: EpubFrameSize };

/**
 * De-duplicates intrinsic media layout observations across renderer swaps.
 * Hidden/stale renderers keep their discoveries local until they actually
 * commit, so abandoned staging work cannot suppress a required active reflow.
 */
export class EpubLayoutSignatureTracker {
  private readonly committed = new Set<string>();

  observe(rendererSignatures: Set<string>, signature: string, active: boolean) {
    if (rendererSignatures.has(signature)) return false;
    rendererSignatures.add(signature);
    if (!active || this.committed.has(signature)) return false;
    this.committed.add(signature);
    return true;
  }

  commit(rendererSignatures: ReadonlySet<string>) {
    for (const signature of rendererSignatures) this.committed.add(signature);
  }

  reset() {
    this.committed.clear();
  }
}

export class EpubViewportStability {
  private committed: EpubFrameSize | null = null;
  private requested: EpubFrameSize | null = null;
  private candidate: EpubFrameSize | null = null;
  private stableSamples = 0;

  constructor(private readonly requiredStableSamples = 2) {
    if (!Number.isInteger(requiredStableSamples) || requiredStableSamples < 1) {
      throw new RangeError("requiredStableSamples must be a positive integer");
    }
  }

  sample(size: EpubFrameSize): EpubViewportSample {
    if (sameEpubFrameSize(size, this.requested)) {
      this.resetCandidate();
      return { state: "unchanged", size };
    }
    if (!this.requested && sameEpubFrameSize(size, this.committed)) {
      this.resetCandidate();
      return { state: "unchanged", size };
    }
    if (sameEpubFrameSize(size, this.candidate)) {
      this.stableSamples += 1;
    } else {
      this.candidate = size;
      this.stableSamples = 1;
    }
    if (this.stableSamples < this.requiredStableSamples) return { state: "wait", size };
    this.markRequested(size);
    return { state: "request", size };
  }

  markRequested(size: EpubFrameSize) {
    this.requested = size;
    this.resetCandidate();
  }

  markCommitted(size: EpubFrameSize) {
    this.committed = size;
    if (sameEpubFrameSize(size, this.requested)) this.requested = null;
    this.resetCandidate();
  }

  /** Releases a failed request so a later ResizeObserver sample may retry it. */
  markRejected() {
    this.requested = null;
    this.resetCandidate();
  }

  reset() {
    this.committed = null;
    this.requested = null;
    this.resetCandidate();
  }

  private resetCandidate() {
    this.candidate = null;
    this.stableSamples = 0;
  }
}

function epubRectHasGeometry(rect: Pick<DOMRectReadOnly, "top" | "right" | "bottom" | "left" | "width" | "height">) {
  return [rect.top, rect.right, rect.bottom, rect.left, rect.width, rect.height].every(Number.isFinite)
    && (rect.width > 0 || rect.height > 0);
}

function epubEdgeTextNode(root: Node | undefined, fromEnd: boolean): Text | null {
  if (!root) return null;
  if (root.nodeType === 3) return root.textContent?.length ? root as Text : null;
  const children = Array.from(root.childNodes);
  if (fromEnd) children.reverse();
  for (const child of children) {
    const text = epubEdgeTextNode(child, fromEnd);
    if (text) return text;
  }
  return null;
}

/** Returns measurable geometry for collapsed CFIs by expanding only a clone to an adjacent character. */
export function epubAnchorClientRects(range: Range): DOMRect[] {
  const direct = Array.from(range.getClientRects()).filter(epubRectHasGeometry);
  if (direct.length) return direct;
  const bounding = range.getBoundingClientRect();
  if (epubRectHasGeometry(bounding)) return [bounding];
  if (!range.collapsed) return [];

  try {
    const measurable = range.cloneRange();
    const container = range.startContainer;
    const offset = range.startOffset;
    if (container.nodeType === 3) {
      const length = container.textContent?.length ?? 0;
      if (offset < length) {
        measurable.setEnd(container, offset + 1);
      } else if (offset > 0) {
        measurable.setStart(container, offset - 1);
      } else {
        return [];
      }
    } else {
      const after = epubEdgeTextNode(container.childNodes[offset], false);
      const before = epubEdgeTextNode(container.childNodes[offset - 1], true);
      if (after) {
        measurable.setStart(after, 0);
        measurable.setEnd(after, 1);
      } else if (before) {
        const length = before.textContent?.length ?? 0;
        if (!length) return [];
        measurable.setStart(before, length - 1);
        measurable.setEnd(before, length);
      } else {
        return [];
      }
    }
    const expanded = Array.from(measurable.getClientRects()).filter(epubRectHasGeometry);
    if (expanded.length) return expanded;
    const expandedBounding = measurable.getBoundingClientRect();
    return epubRectHasGeometry(expandedBounding) ? [expandedBounding] : [];
  } catch {
    return [];
  }
}

export function epubContentRectIsVisible(
  contentRect: Pick<DOMRectReadOnly, "top" | "right" | "bottom" | "left">,
  iframeRect: Pick<DOMRectReadOnly, "top" | "left">,
  hostRect: Pick<DOMRectReadOnly, "top" | "right" | "bottom" | "left">,
  tolerance = 1,
) {
  const top = iframeRect.top + contentRect.top;
  const right = iframeRect.left + contentRect.right;
  const bottom = iframeRect.top + contentRect.bottom;
  const left = iframeRect.left + contentRect.left;
  return bottom >= hostRect.top - tolerance
    && top <= hostRect.bottom + tolerance
    && right >= hostRect.left - tolerance
    && left <= hostRect.right + tolerance;
}

/**
 * One authority for EPUB navigation and reflow.
 *
 * Reflow and absolute navigation are rendered in the inactive slot. The old
 * slot remains active until the replacement has displayed, settled, validated
 * its source CFI, and consumed every page turn queued during the transition.
 * The swap is then synchronous. Async work is tokened so stale renderers can
 * never publish or overwrite a newer location.
 */
export class EpubNavigator<Config> {
  private readonly schedule: (task: () => void) => void;
  private readonly commands: Command<Config>[] = [];
  private readonly idleWaiters = new Set<() => void>();
  private active: ActiveRenderer | null = null;
  private committedLocator: EpubLocator | null = null;
  private transition: Transition<Config> | null = null;
  private supersedingAtomic: AtomicCommand<Config> | null = null;
  private scheduled = false;
  private processing = false;
  private disposed = false;
  private token = 0;
  private navigationEpoch = 0;
  private busy = false;

  constructor(private readonly options: EpubNavigatorOptions<Config>) {
    this.schedule = options.schedule ?? ((task) => queueMicrotask(task));
    options.setSlotState(0, "inactive");
    options.setSlotState(1, "inactive");
  }

  initialize(request: Omit<EpubAtomicRequest<Config>, "kind" | "cause">) {
    this.enqueueAtomic({
      ...request,
      kind: "initial",
      cause: "initial",
      validateAnchor: request.validateAnchor ?? Boolean(request.anchor),
    });
  }

  requestReflow(request: Omit<EpubAtomicRequest<Config>, "kind" | "target"> & {
    cause: "appearance" | "viewport" | "media";
  }) {
    if (this.disposed) return;
    const command = this.atomicCommand({
      ...request,
      kind: "reflow",
      target: null,
      validateAnchor: request.validateAnchor ?? Boolean(request.anchor),
    });

    if (this.transition) {
      const transition = this.transition;
      transition.cancelled = true;
      if (this.supersedingAtomic) {
        this.supersedingAtomic = this.applyReflow(this.supersedingAtomic, command);
      } else {
        this.supersedingAtomic = this.applyReflow(
          { ...transition.request, turns: [...transition.turns] },
          command,
        );
      }
      this.scheduleDrain();
      return;
    }

    const last = this.commands.at(-1);
    if (last?.type === "atomic") {
      this.commands[this.commands.length - 1] = this.applyReflow(last, command);
    } else {
      this.commands.push(command);
    }
    this.scheduleDrain();
  }

  navigate(request: Omit<EpubAtomicRequest<Config>, "kind"> & { target: string }) {
    if (this.disposed) return;
    const command = this.atomicCommand({
      ...request,
      kind: "navigate",
      validateAnchor: request.validateAnchor ?? request.target.startsWith("epubcfi("),
    });
    if (this.transition) {
      this.transition.cancelled = true;
      this.supersedingAtomic = command;
    } else {
      const last = this.commands.at(-1);
      if (last?.type === "atomic") {
        // A later absolute destination supersedes an atomic command that has
        // not started. Publishing the older destination would expose an
        // avoidable intermediate page before the user's final intent.
        this.commands[this.commands.length - 1] = command;
      } else {
        this.commands.push(command);
      }
    }
    this.scheduleDrain();
  }

  turn(direction: EpubTurnDirection) {
    if (this.disposed) return;
    if (this.transition) {
      if (this.transition.cancelled && this.supersedingAtomic) {
        this.supersedingAtomic.turns.push(direction);
      } else {
        this.transition.turns.push(direction);
      }
      return;
    }
    const last = this.commands.at(-1);
    if (last?.type === "atomic") {
      last.turns.push(direction);
    } else {
      this.commands.push({ type: "turn", direction });
    }
    this.scheduleDrain();
  }

  getActiveRenderer() {
    return this.active?.renderer ?? null;
  }

  getCommittedLocator() {
    return this.committedLocator;
  }

  isBusy() {
    return this.busy;
  }

  whenIdle() {
    if (this.isIdle()) return Promise.resolve();
    return new Promise<void>((resolve) => this.idleWaiters.add(resolve));
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.token += 1;
    this.commands.length = 0;
    this.supersedingAtomic = null;
    if (this.transition?.renderer) {
      this.safeDestroy(this.transition.renderer);
      this.transition.renderer = null;
    }
    if (this.transition) this.options.setSlotState(this.transition.slot, "inactive");
    this.transition = null;
    if (this.active) {
      this.safeDestroy(this.active.renderer);
      this.options.setSlotState(this.active.slot, "inactive");
    }
    this.active = null;
    this.setBusy(false);
    this.resolveIdleWaiters();
  }

  private enqueueAtomic(request: EpubAtomicRequest<Config>) {
    if (this.disposed) return;
    this.commands.push(this.atomicCommand(request));
    this.scheduleDrain();
  }

  private atomicCommand(request: EpubAtomicRequest<Config>): AtomicCommand<Config> {
    return {
      ...request,
      type: "atomic",
      baseNavigationEpoch: this.navigationEpoch,
      turns: [],
    };
  }

  private applyReflow(current: AtomicCommand<Config>, reflow: AtomicCommand<Config>): AtomicCommand<Config> {
    if (current.kind !== "reflow") {
      if (reflow.replaceAnchor) {
        // A finalized selection is a newer, higher-fidelity reading
        // observation on the still-authoritative frame. It supersedes an
        // uncommitted absolute destination and its earlier queued turns;
        // turns received after this selection are appended normally.
        return {
          ...reflow,
          baseNavigationEpoch: current.baseNavigationEpoch,
          turns: [...reflow.turns],
        };
      }
      // A viewport or ordinary appearance change must not erase an in-flight
      // initial, TOC, percentage, or reference destination. Only its render
      // config is replaced; intent, destination, fallback, and turns survive.
      return {
        ...current,
        config: reflow.config,
      };
    }
    return {
      ...reflow,
      anchor: reflow.replaceAnchor ? reflow.anchor : (current.anchor ?? reflow.anchor),
      baseNavigationEpoch: current.baseNavigationEpoch,
      turns: [...current.turns, ...reflow.turns],
    };
  }

  private scheduleDrain() {
    if (this.disposed || this.scheduled || this.processing) return;
    this.scheduled = true;
    this.schedule(() => {
      this.scheduled = false;
      void this.drain();
    });
  }

  private async drain() {
    if (this.disposed || this.processing) return;
    this.processing = true;
    try {
      while (!this.disposed) {
        if (this.supersedingAtomic) {
          this.commands.unshift(this.supersedingAtomic);
          this.supersedingAtomic = null;
        }
        const command = this.commands.shift();
        if (!command) break;
        if (command.type === "turn") {
          await this.executeTurn(command.direction);
        } else {
          await this.executeAtomic(command);
        }
      }
    } finally {
      this.processing = false;
      if (!this.disposed && (this.commands.length || this.supersedingAtomic)) this.scheduleDrain();
      else if (!this.transition) {
        this.setBusy(false);
        this.resolveIdleWaiters();
      }
    }
  }

  private async executeTurn(direction: EpubTurnDirection) {
    const active = this.active;
    if (!active || this.disposed) return;
    this.setBusy(true);
    try {
      const locator = await active.renderer.turn(direction);
      if (this.disposed || this.active !== active) return;
      this.committedLocator = locator;
      this.navigationEpoch += 1;
      this.options.onCommit({
        slot: active.slot,
        previousSlot: active.slot,
        renderer: active.renderer,
        locator,
        anchor: locator.cfi,
        cause: "page-turn",
        userInitiated: true,
        atomic: false,
      });
    } catch (error) {
      this.reportError("page-turn", error);
    }
  }

  private async executeAtomic(request: AtomicCommand<Config>) {
    if (this.disposed) return;
    this.setBusy(true);
    const oldActive = this.active;
    const slot: EpubRendererSlot = oldActive?.slot === 0 ? 1 : 0;
    const token = ++this.token;
    const effectiveAnchor = request.kind === "reflow"
      && request.baseNavigationEpoch !== this.navigationEpoch
      ? this.committedLocator?.cfi ?? request.anchor
      : request.anchor;
    const transition: Transition<Config> = {
      token,
      request: { ...request, anchor: effectiveAnchor },
      slot,
      renderer: null,
      turns: [...request.turns],
      appliedTurns: 0,
      cancelled: false,
    };
    this.transition = transition;
    this.options.setSlotState(slot, "staging");
    const restoreFocus = Boolean(oldActive && this.safeHasFocus(oldActive.renderer));

    try {
      let renderer = await this.options.createRenderer(slot, request.config);
      transition.renderer = renderer;
      if (this.isStale(transition)) return this.abandonTransition(transition);

      const target = request.kind === "navigate"
        ? request.target ?? undefined
        : effectiveAnchor ?? request.target ?? undefined;
      const validationCfi = request.kind === "navigate" && request.target?.startsWith("epubcfi(")
        ? request.target
        : effectiveAnchor;
      let locator: EpubLocator;
      let usedStartFallback = false;
      try {
        locator = await renderer.display(target);
        if (this.isStale(transition)) return this.abandonTransition(transition);
        if (request.validateAnchor && validationCfi) {
          // Validate the exact source page before consuming queued turns. A
          // visually wrong display must never become the base for user input.
          const visible = await renderer.isAnchorVisible(validationCfi);
          if (this.isStale(transition)) return this.abandonTransition(transition);
          if (!visible) throw new EpubAnchorNotVisibleError(validationCfi);
        }
      } catch (error) {
        if (!request.allowStartFallback || !target || this.isStale(transition)) throw error;
        // A rejected or incorrectly placed CFI can leave an EPUB.js manager
        // partially mutated. Do not reuse that hidden renderer for the
        // publication-start fallback.
        this.safeDestroy(renderer);
        transition.renderer = null;
        usedStartFallback = true;
        renderer = await this.options.createRenderer(slot, request.config);
        transition.renderer = renderer;
        if (this.isStale(transition)) return this.abandonTransition(transition);
        locator = await renderer.display(undefined);
      }
      if (this.isStale(transition)) return this.abandonTransition(transition);

      const exactNavigationTarget = request.kind === "navigate"
        && request.target?.startsWith("epubcfi(")
        ? request.target
        : null;
      let commitAnchor: string | null = null;
      while (true) {
        while (transition.appliedTurns < transition.turns.length) {
          const direction = transition.turns[transition.appliedTurns];
          locator = await renderer.turn(direction);
          transition.appliedTurns += 1;
          if (this.isStale(transition)) return this.abandonTransition(transition);
        }

        locator = await renderer.snapshot();
        if (this.isStale(transition)) return this.abandonTransition(transition);
        if (transition.appliedTurns < transition.turns.length) continue;
        commitAnchor = transition.turns.length || usedStartFallback
          ? locator.cfi
          : request.kind === "navigate"
            ? (exactNavigationTarget ?? locator.cfi)
            : (effectiveAnchor ?? locator.cfi);

        // Expose the validated replacement underneath the old frame and allow
        // it to paint before the swap. This avoids making a visibility-hidden
        // iframe pay its first rasterization cost after becoming authoritative.
        this.options.setSlotState(slot, "ready");
        await this.options.prepareSlotForCommit?.(slot, renderer);
        if (this.isStale(transition)) return this.abandonTransition(transition);
        if (transition.appliedTurns < transition.turns.length) {
          this.options.setSlotState(slot, "staging");
          continue;
        }

        // Fonts and intrinsic media can still perturb columns between the
        // first settled snapshot and the actual paint. Revalidate the exact
        // commit anchor at the swap boundary while the old readable frame is
        // still on top; a late layout shift can therefore never become visible.
        if (commitAnchor) {
          const visible = await renderer.isAnchorVisible(commitAnchor);
          if (this.isStale(transition)) return this.abandonTransition(transition);
          if (!visible) throw new EpubAnchorNotVisibleError(commitAnchor);
        }
        if (transition.appliedTurns < transition.turns.length) {
          this.options.setSlotState(slot, "staging");
          continue;
        }
        break;
      }

      if (this.isStale(transition)) return this.abandonTransition(transition);
      const previousSlot = oldActive?.slot ?? null;
      // Promote the painted replacement before hiding the readable old layer.
      this.options.setSlotState(slot, "active");
      if (oldActive) this.options.setSlotState(oldActive.slot, "inactive");
      this.active = { slot, renderer };
      this.committedLocator = locator;
      this.transition = null;
      const userInitiated = Boolean(request.userInitiated || transition.turns.length);
      if (userInitiated) this.navigationEpoch += 1;
      try {
        this.options.onCommit({
          slot,
          previousSlot,
          renderer,
          locator,
          anchor: commitAnchor,
          cause: transition.turns.length ? "page-turn" : request.cause,
          userInitiated,
          atomic: true,
        });
      } catch (error) {
        // Publishing state must not roll back an already-visible, validated
        // renderer or resurrect the stale frame.
        this.reportError(request.cause, error);
      }
      if (restoreFocus) this.safeFocus(renderer);
      if (oldActive) this.safeDestroy(oldActive.renderer);
    } catch (error) {
      if (this.isStale(transition)) {
        this.abandonTransition(transition);
        return;
      }
      if (transition.renderer) this.safeDestroy(transition.renderer);
      this.options.setSlotState(slot, "inactive");
      this.transition = null;
      this.reportError(request.cause, error);
      if (oldActive && transition.turns.length) {
        // The replacement never committed, so replay every user turn against
        // the still-readable authoritative frame instead of dropping input.
        this.commands.unshift(...transition.turns.map<TurnCommand>((direction) => ({
          type: "turn",
          direction,
        })));
      }
    }
  }

  private isStale(transition: Transition<Config>) {
    return this.disposed
      || transition.cancelled
      || transition.token !== this.token
      || this.transition !== transition;
  }

  private abandonTransition(transition: Transition<Config>) {
    if (transition.renderer) {
      this.safeDestroy(transition.renderer);
      transition.renderer = null;
    }
    this.options.setSlotState(transition.slot, "inactive");
    if (this.transition === transition) this.transition = null;
  }

  private reportError(cause: EpubNavigationCause, error: unknown) {
    this.options.onError?.({
      cause,
      error,
      retainedReadableFrame: Boolean(this.active),
    });
  }

  private setBusy(busy: boolean) {
    if (this.busy === busy) return;
    this.busy = busy;
    this.options.onBusyChange?.(busy);
  }

  private safeDestroy(renderer: EpubRenderer) {
    try {
      renderer.destroy();
    } catch {
      // Cleanup must not interrupt the newer committed renderer.
    }
  }

  private safeHasFocus(renderer: EpubRenderer) {
    try {
      return renderer.hasFocus?.() ?? false;
    } catch {
      return false;
    }
  }

  private safeFocus(renderer: EpubRenderer) {
    try {
      renderer.focus?.();
    } catch {
      // A focus failure must not roll back a validated, visible renderer.
    }
  }

  private isIdle() {
    return !this.processing
      && !this.scheduled
      && !this.transition
      && !this.supersedingAtomic
      && this.commands.length === 0;
  }

  private resolveIdleWaiters() {
    if (!this.isIdle() && !this.disposed) return;
    for (const resolve of this.idleWaiters) resolve();
    this.idleWaiters.clear();
  }
}
