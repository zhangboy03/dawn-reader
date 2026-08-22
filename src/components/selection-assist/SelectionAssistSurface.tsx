import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { SelectionAssistAnchor, SelectionAssistVisibleBounds } from "../../lib/selectionAssistAnchor";
import {
  clampSelectionAssistDragPosition,
  visualViewportRect,
  type SelectionAssistDragPosition,
} from "../../lib/selectionAssistPosition";
import { useSelectionAssistSurface } from "./useSelectionAssistSurface";
import "../../selection-assist.css";

type SelectionAssistSurfaceProps = {
  open?: boolean;
  title: ReactNode;
  ariaLabel: string;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onDismiss: () => void;
  getAnchor: () => SelectionAssistAnchor | null;
  getBoundary?: () => SelectionAssistVisibleBounds | null;
  getEventTargets?: () => Array<EventTarget | null | undefined>;
  getBoundaryElement?: () => Element | null;
  returnFocus?: () => HTMLElement | null;
  className?: string;
  layoutKey?: string | number;
  dragResetKey?: string | number;
  width?: number;
  maximumHeight?: number;
  minimumUsefulHeight?: number;
  compactBreakpoint?: number;
  preferredSide?: "above" | "below" | "auto";
  focusOnOpen?: boolean;
  closeLabel?: string;
};

function focusableElements(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(
    'button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
}

export function SelectionAssistSurface({
  open = true,
  title,
  ariaLabel,
  actions,
  children,
  footer,
  onDismiss,
  getAnchor,
  getBoundary,
  getEventTargets,
  getBoundaryElement,
  returnFocus,
  className = "",
  layoutKey = 0,
  dragResetKey = 0,
  width = 420,
  maximumHeight = 560,
  minimumUsefulHeight = 176,
  compactBreakpoint = 720,
  preferredSide = "auto",
  focusOnOpen = false,
  closeLabel = "关闭解释",
}: SelectionAssistSurfaceProps) {
  const titleId = useId();
  const returnTargetRef = useRef<HTMLElement | null>(null);
  const didFocusRef = useRef(false);
  const outsidePointerRef = useRef<number | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: SelectionAssistDragPosition;
  } | null>(null);
  const dismissedRef = useRef(false);
  const [manualPosition, setManualPosition] = useState<SelectionAssistDragPosition | null>(null);
  const [dragging, setDragging] = useState(false);
  const { surfaceRef, position, compact } = useSelectionAssistSurface({
    open,
    getAnchor,
    getBoundary,
    getEventTargets,
    getBoundaryElement,
    layoutKey,
    width,
    maximumHeight,
    minimumUsefulHeight,
    compactBreakpoint,
    preferredSide,
  });

  const dismiss = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    onDismiss();
  };

  useEffect(() => {
    dismissedRef.current = false;
    returnTargetRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : returnFocus?.() ?? null;
    return () => {
      const target = returnFocus?.() ?? returnTargetRef.current;
      window.requestAnimationFrame(() => {
        if (target?.isConnected) target.focus({ preventScroll: true });
      });
    };
  }, []); // One focus contract per mounted assistance surface.

  useEffect(() => {
    if (!position || didFocusRef.current || (!compact && !focusOnOpen)) return;
    didFocusRef.current = true;
    const root = surfaceRef.current;
    const target = root?.querySelector<HTMLElement>("[data-selection-assist-autofocus]")
      ?? root?.querySelector<HTMLElement>("[data-selection-assist-close]")
      ?? null;
    window.requestAnimationFrame(() => target?.focus({ preventScroll: true }));
  }, [compact, focusOnOpen, position, surfaceRef]);

  useLayoutEffect(() => {
    dragRef.current = null;
    setDragging(false);
    setManualPosition(null);
  }, [dragResetKey]);

  const clampDraggedPosition = (next: SelectionAssistDragPosition) => {
    const surface = surfaceRef.current;
    if (!surface) return next;
    const rect = surface.getBoundingClientRect();
    return clampSelectionAssistDragPosition({
      position: next,
      surface: {
        width: rect.width || position?.width || width,
        height: rect.height || position?.height || minimumUsefulHeight,
      },
      viewport: visualViewportRect(window.visualViewport, {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
      safeArea: getBoundary?.() ?? null,
    });
  };

  useLayoutEffect(() => {
    if (!manualPosition || dragging) return;
    setManualPosition((current) => {
      if (!current) return current;
      const next = clampDraggedPosition(current);
      return next.left === current.left && next.top === current.top ? current : next;
    });
  }, [dragging, layoutKey, position?.height, position?.maxHeight, position?.width]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismiss();
        return;
      }
      if (event.key !== "Tab" || !compact || !surfaceRef.current) return;
      const focusable = focusableElements(surfaceRef.current);
      if (!focusable.length) return;
      const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const nextIndex = event.shiftKey
        ? (activeIndex <= 0 ? focusable.length - 1 : activeIndex - 1)
        : (activeIndex < 0 || activeIndex === focusable.length - 1 ? 0 : activeIndex + 1);
      event.preventDefault();
      focusable[nextIndex].focus();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [compact, surfaceRef]);

  if (!open) return null;
  const style = {
    left: manualPosition?.left ?? position?.left,
    top: manualPosition?.top ?? position?.top,
    // Give the first unconstrained measurement the intended line-wrapping
    // width. CSS still clamps it to the visual viewport on compact screens.
    width: position?.width ?? width,
    maxHeight: position?.maxHeight,
    visibility: position ? "visible" : "hidden",
  } satisfies CSSProperties;
  const placement = position?.placement ?? "below";
  const active = position !== null;

  const consumeOutsidePointer = (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const containInternalPointer = (event: ReactPointerEvent<HTMLElement>) => {
    // Prevent reader/PDF gesture handlers from seeing the interaction without
    // cancelling the control's own focus, text selection, or click behavior.
    event.stopPropagation();
  };
  const onOutsidePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    consumeOutsidePointer(event);
    outsidePointerRef.current = event.pointerId;
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* pointer capture is an optimization */ }
  };
  const onOutsidePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    consumeOutsidePointer(event);
    if (outsidePointerRef.current !== event.pointerId) return;
    outsidePointerRef.current = null;
    try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch { /* capture may already be released */ }
    dismiss();
  };
  const onDragPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0 || !position) return;
    if ((event.target as Element | null)?.closest(".selection-assist-actions")) return;
    event.preventDefault();
    event.stopPropagation();
    const origin = clampDraggedPosition(manualPosition ?? { left: position.left, top: position.top });
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin,
    };
    setManualPosition(origin);
    setDragging(true);
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* pointer capture is an optimization */ }
  };
  const onDragPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    setManualPosition(clampDraggedPosition({
      left: drag.origin.left + event.clientX - drag.startX,
      top: drag.origin.top + event.clientY - drag.startY,
    }));
  };
  const finishDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = null;
    setDragging(false);
    try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch { /* capture may already be released */ }
  };

  return <>
    <div
      className="selection-assist-dismiss-layer"
      aria-hidden="true"
      data-selection-assist-dismiss-layer
      style={{ pointerEvents: active ? "auto" : "none" }}
      onPointerDown={onOutsidePointerDown}
      onPointerUp={onOutsidePointerUp}
      onPointerCancel={(event) => {
        consumeOutsidePointer(event);
        outsidePointerRef.current = null;
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    />
    <aside
      ref={surfaceRef}
      className={`selection-assist-surface ${className}`.trim()}
      style={style}
      role="dialog"
      aria-label={ariaLabel}
      aria-labelledby={titleId}
      aria-modal={compact ? true : undefined}
      aria-hidden={!active || undefined}
      data-placement={placement}
      data-strategy={position?.strategy}
      data-position-mode={manualPosition ? "manual" : "auto"}
      data-dragging={dragging || undefined}
      onPointerDown={containInternalPointer}
      onPointerUp={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onTouchMove={(event) => event.stopPropagation()}
    >
      <header
        className="selection-assist-header"
        data-selection-assist-header
        data-selection-assist-drag-handle
        onPointerDown={onDragPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <strong id={titleId}>{title}</strong>
        <div className="selection-assist-actions">
          {actions}
          <button
            type="button"
            className="selection-assist-close"
            aria-label={closeLabel}
            data-selection-assist-close
            onClick={dismiss}
          >×</button>
        </div>
      </header>
      <div className="selection-assist-body" data-selection-assist-body>
        <div className="selection-assist-body-inner" data-selection-assist-body-inner>{children}</div>
      </div>
      {footer && <footer className="selection-assist-footer" data-selection-assist-footer>{footer}</footer>}
    </aside>
  </>;
}
