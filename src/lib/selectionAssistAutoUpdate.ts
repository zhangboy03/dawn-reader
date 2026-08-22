type AutoUpdateTarget = EventTarget | null | undefined;

type AutoUpdateOptions = {
  windowTarget: Window;
  documentTarget?: Document | null;
  visualViewport?: VisualViewport | null;
  eventTargets?: AutoUpdateTarget[];
  observedElements?: Array<Element | null | undefined>;
  mutationRoot?: Node | null;
  onUpdate: () => void;
  ResizeObserverConstructor?: typeof ResizeObserver;
  MutationObserverConstructor?: typeof MutationObserver;
};

export function selectionAssistAutoUpdate({
  windowTarget,
  documentTarget = windowTarget.document,
  visualViewport = windowTarget.visualViewport,
  eventTargets = [],
  observedElements = [],
  mutationRoot = null,
  onUpdate,
  ResizeObserverConstructor = (windowTarget as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver,
  MutationObserverConstructor = (windowTarget as Window & { MutationObserver?: typeof MutationObserver }).MutationObserver,
}: AutoUpdateOptions) {
  let disposed = false;
  let frame: number | null = null;
  const schedule = () => {
    if (disposed || frame !== null) return;
    frame = windowTarget.requestAnimationFrame(() => {
      frame = null;
      if (!disposed) onUpdate();
    });
  };

  const listeners: Array<() => void> = [];
  const listen = (target: AutoUpdateTarget, type: string, options?: AddEventListenerOptions | boolean) => {
    if (!target || !("addEventListener" in target)) return;
    target.addEventListener(type, schedule as EventListener, options);
    listeners.push(() => target.removeEventListener(type, schedule as EventListener, options));
  };

  listen(windowTarget, "resize", { passive: true });
  listen(windowTarget, "scroll", { passive: true, capture: true });
  listen(documentTarget, "selectionchange", { passive: true });
  listen(visualViewport, "resize", { passive: true });
  listen(visualViewport, "scroll", { passive: true });
  for (const target of new Set(eventTargets.filter(Boolean))) {
    listen(target, "scroll", { passive: true });
    listen(target, "resize", { passive: true });
    listen(target, "selectionchange", { passive: true });
    listen(target, "selectionassistlayout");
  }

  const resizeObserver = ResizeObserverConstructor
    ? new ResizeObserverConstructor(schedule)
    : null;
  for (const element of observedElements) if (element) resizeObserver?.observe(element);

  const mutationObserver = MutationObserverConstructor && mutationRoot
    ? new MutationObserverConstructor(schedule)
    : null;
  mutationObserver?.observe(mutationRoot!, { childList: true, subtree: true, characterData: true });

  schedule();
  return () => {
    disposed = true;
    if (frame !== null) windowTarget.cancelAnimationFrame(frame);
    frame = null;
    listeners.forEach((remove) => remove());
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
  };
}
