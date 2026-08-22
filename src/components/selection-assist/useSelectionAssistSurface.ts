import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { SelectionAssistAnchor, SelectionAssistVisibleBounds } from "../../lib/selectionAssistAnchor";
import { selectionAssistAutoUpdate } from "../../lib/selectionAssistAutoUpdate";
import {
  selectionAssistPosition,
  selectionAssistPositionEqual,
  visualViewportRect,
  type SelectionAssistPosition,
} from "../../lib/selectionAssistPosition";

type UseSelectionAssistSurfaceOptions = {
  open: boolean;
  getAnchor: () => SelectionAssistAnchor | null;
  getBoundary?: () => SelectionAssistVisibleBounds | null;
  getEventTargets?: () => Array<EventTarget | null | undefined>;
  getBoundaryElement?: () => Element | null;
  layoutKey?: string | number;
  width: number;
  maximumHeight: number;
  minimumUsefulHeight: number;
  compactBreakpoint?: number;
  preferredSide?: "above" | "below" | "auto";
};

export type SelectionAssistSurfaceHook = {
  surfaceRef: RefObject<HTMLElement | null>;
  position: SelectionAssistPosition | null;
  compact: boolean;
  schedule: () => void;
};

function elementHeight(element: Element | null) {
  if (!(element instanceof HTMLElement)) return 0;
  return Math.max(element.scrollHeight, element.offsetHeight, element.getBoundingClientRect().height);
}

export function measureSelectionAssistNaturalHeight(surface: HTMLElement) {
  const header = surface.querySelector<HTMLElement>("[data-selection-assist-header]");
  const body = surface.querySelector<HTMLElement>("[data-selection-assist-body]");
  const footer = surface.querySelector<HTMLElement>("[data-selection-assist-footer]");
  const borderHeight = Math.max(0, surface.offsetHeight - surface.clientHeight);
  const measured = elementHeight(header) + (body?.scrollHeight ?? 0) + elementHeight(footer) + borderHeight;
  return Math.max(1, measured || surface.scrollHeight || surface.getBoundingClientRect().height || 1);
}

export function useSelectionAssistSurface({
  open,
  getAnchor,
  getBoundary,
  getEventTargets,
  getBoundaryElement,
  layoutKey = 0,
  width,
  maximumHeight,
  minimumUsefulHeight,
  compactBreakpoint = 720,
  preferredSide = "auto",
}: UseSelectionAssistSurfaceOptions): SelectionAssistSurfaceHook {
  const surfaceRef = useRef<HTMLElement>(null);
  const [position, setPosition] = useState<SelectionAssistPosition | null>(null);
  const scheduleRef = useRef<() => void>(() => undefined);
  const callbacksRef = useRef({ getAnchor, getBoundary, getEventTargets, getBoundaryElement });
  callbacksRef.current = { getAnchor, getBoundary, getEventTargets, getBoundaryElement };

  useLayoutEffect(() => {
    if (!open || typeof window === "undefined") {
      setPosition(null);
      scheduleRef.current = () => undefined;
      return;
    }

    const surface = surfaceRef.current;
    if (!surface) return;
    let updateNow = () => undefined;
    const cleanup = selectionAssistAutoUpdate({
      windowTarget: window,
      documentTarget: document,
      visualViewport: window.visualViewport,
      eventTargets: callbacksRef.current.getEventTargets?.() ?? [],
      observedElements: [
        surface.querySelector("[data-selection-assist-header]"),
        surface.querySelector("[data-selection-assist-body]"),
        surface.querySelector("[data-selection-assist-body-inner]"),
        surface.querySelector("[data-selection-assist-footer]"),
        callbacksRef.current.getBoundaryElement?.(),
      ],
      mutationRoot: surface,
      onUpdate: () => updateNow(),
      ResizeObserverConstructor: typeof ResizeObserver === "undefined" ? undefined : ResizeObserver,
      MutationObserverConstructor: typeof MutationObserver === "undefined" ? undefined : MutationObserver,
    });

    updateNow = () => {
      const anchor = callbacksRef.current.getAnchor();
      if (!anchor || !surfaceRef.current) {
        setPosition((current) => current === null ? current : null);
        return;
      }
      const viewport = visualViewportRect(window.visualViewport, {
        width: window.innerWidth,
        height: window.innerHeight,
      });
      const next = selectionAssistPosition({
        anchor,
        popover: {
          width,
          naturalHeight: measureSelectionAssistNaturalHeight(surfaceRef.current),
        },
        viewport,
        safeArea: callbacksRef.current.getBoundary?.() ?? null,
        compact: viewport.width <= compactBreakpoint,
        maximumHeight,
        minimumUsefulHeight,
        preferredSide,
      });
      setPosition((current) => selectionAssistPositionEqual(current, next) ? current : next);
    };
    scheduleRef.current = updateNow;
    updateNow();

    return () => {
      cleanup();
      scheduleRef.current = () => undefined;
    };
  }, [compactBreakpoint, layoutKey, maximumHeight, minimumUsefulHeight, open, preferredSide, width]);

  return {
    surfaceRef,
    position,
    compact: position?.placement === "sheet",
    schedule: () => scheduleRef.current(),
  };
}
