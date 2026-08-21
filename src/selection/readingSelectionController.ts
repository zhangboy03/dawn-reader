import {
  compareDomPoints,
  snapSelectionToWholeWords,
  type DomPoint,
} from './domWordSelection';
import { getWordBoundaries } from './wordBoundary';

const STYLE_ID = 'dawn-word-selection-style';
const POINTER_MOVE_THRESHOLD = 2;

const NON_READING_TARGETS = [
  'a', 'button', 'input', 'textarea', 'select', 'option', 'label',
  'audio', 'video', 'canvas', '[role="button"]', '[role="link"]',
  '[contenteditable="true"]', '[contenteditable="plaintext-only"]',
  '.annotationLayer', '.linkAnnotation', '.dawn-selection-card',
  '[data-dawn-selection-control]', '[data-no-text-selection]',
].join(',');

type PointerSession = {
  pointerId: number;
  pointerType: string;
  anchor: DomPoint | null;
  focus: DomPoint | null;
  startX: number;
  startY: number;
  moved: boolean;
  precisionBypass: boolean;
};

export interface ReadingSelectionControllerOptions {
  locale?: string;
}

export interface ReadingSelectionController {
  destroy(): void;
  snapNow(): boolean;
}

function documentForRoot(root: Element): Document {
  return root.ownerDocument;
}

function selectionForRoot(root: Element): Selection | null {
  return documentForRoot(root).defaultView?.getSelection() ?? null;
}

function eventElement(target: EventTarget | null): Element | null {
  if (!target) return null;
  if ((target as Node).nodeType === 1) return target as Element;
  return (target as Node).parentElement ?? null;
}

export function isReadingTextTarget(root: Element, target: EventTarget | null): boolean {
  const element = eventElement(target);
  if (!element || (!root.contains(element) && root !== element)) return false;
  return !element.closest(NON_READING_TARGETS);
}


function allowsPointingSelection(root: Element, target: EventTarget | null): boolean {
  const element = eventElement(target);
  const view = root.ownerDocument.defaultView;
  if (!element || !view) return false;
  try {
    const style = view.getComputedStyle(element) as CSSStyleDeclaration & { webkitUserSelect?: string };
    return style.userSelect !== 'none' && style.webkitUserSelect !== 'none';
  } catch {
    return true;
  }
}

function caretPoint(document: Document, x: number, y: number): DomPoint | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = doc.caretPositionFromPoint?.(x, y);
  if (position) return { node: position.offsetNode, offset: position.offset };
  const range = doc.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

function pointHitsWordGlyph(point: DomPoint, x: number, y: number, locale?: string): boolean {
  if (point.node.nodeType !== Node.TEXT_NODE) return false;
  const text = point.node as Text;
  const words = getWordBoundaries(text.data, locale);
  const candidates = [point.offset, point.offset - 1];
  for (const offset of candidates) {
    const word = words.find(candidate => offset >= candidate.start && offset < candidate.end);
    if (!word) continue;
    try {
      const range = text.ownerDocument.createRange();
      range.setStart(text, word.start);
      range.setEnd(text, word.end);
      for (const rect of Array.from(range.getClientRects())) {
        const padding = 1.5;
        if (
          rect.width > 0
          && rect.height > 0
          && x >= rect.left - padding
          && x <= rect.right + padding
          && y >= rect.top - padding
          && y <= rect.bottom + padding
        ) return true;
      }
    } catch {
      return false;
    }
  }
  return false;
}

export function ensureWarmSelectionStyle(document: Document): HTMLStyleElement {
  const existing = document.getElementById(STYLE_ID);
  if (existing?.tagName === 'STYLE') return existing as HTMLStyleElement;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.dawn-word-selection-surface::selection,
.dawn-word-selection-surface *::selection {
  background: rgba(215, 166, 82, 0.46) !important;
  color: inherit !important;
  text-shadow: none !important;
}
.dawn-word-selection-surface::-moz-selection,
.dawn-word-selection-surface *::-moz-selection {
  background: rgba(215, 166, 82, 0.46) !important;
  color: inherit !important;
  text-shadow: none !important;
}
@media (prefers-color-scheme: dark) {
  .dawn-word-selection-surface::selection,
  .dawn-word-selection-surface *::selection,
  .dawn-word-selection-surface::-moz-selection,
  .dawn-word-selection-surface *::-moz-selection {
    background: rgba(231, 181, 94, 0.38) !important;
  }
}`;
  (document.head ?? document.documentElement).appendChild(style);
  return style;
}

export function installReadingSelectionController(
  root: Element,
  options: ReadingSelectionControllerOptions = {},
): ReadingSelectionController {
  const document = documentForRoot(root);
  const view = document.defaultView;
  if (!view) return { destroy() {}, snapNow: () => false };

  ensureWarmSelectionStyle(document);
  root.classList.add('dawn-word-selection-surface');

  let session: PointerSession | null = null;
  let animationFrame: number | null = null;
  let suppressSelectStartUntil = 0;
  let destroyed = false;
  const requestFrame = view.requestAnimationFrame
    ? view.requestAnimationFrame.bind(view)
    : (callback: FrameRequestCallback) => view.setTimeout(() => callback(view.performance.now()), 16);
  const cancelFrame = view.cancelAnimationFrame
    ? view.cancelAnimationFrame.bind(view)
    : (handle: number) => view.clearTimeout(handle);

  const clearScheduledFrame = () => {
    if (animationFrame !== null) cancelFrame(animationFrame);
    animationFrame = null;
  };

  const snapNow = (): boolean => {
    if (!session || session.precisionBypass || !session.moved || !session.anchor || !session.focus) return false;
    if (!root.contains(session.anchor.node) || !root.contains(session.focus.node)) {
      session.anchor = null;
      session.focus = null;
      return false;
    }
    const selection = selectionForRoot(root);
    if (!selection) return false;
    try {
      selection.setBaseAndExtent(
        session.anchor.node,
        session.anchor.offset,
        session.focus.node,
        session.focus.offset,
      );
    } catch {
      session.anchor = null;
      session.focus = null;
      return false;
    }
    try {
      return snapSelectionToWholeWords(selection, root, options.locale);
    } catch {
      session.anchor = null;
      session.focus = null;
      return false;
    }
  };

  const scheduleSnap = () => {
    if (animationFrame !== null) return;
    animationFrame = requestFrame(() => {
      animationFrame = null;
      snapNow();
    });
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || (event.pointerType !== 'mouse' && event.pointerType !== 'pen')) return;
    if (!isReadingTextTarget(root, event.target) || !allowsPointingSelection(root, event.target)) return;
    const point = caretPoint(document, event.clientX, event.clientY);
    if (!event.altKey && (!point || !pointHitsWordGlyph(point, event.clientX, event.clientY, options.locale))) return;
    const selection = selectionForRoot(root);
    const fallbackAnchor = selection?.anchorNode
      ? { node: selection.anchorNode, offset: selection.anchorOffset }
      : null;
    session = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      anchor: point ?? fallbackAnchor,
      focus: point ?? fallbackAnchor,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      precisionBypass: event.altKey,
    };
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!session || event.pointerId !== session.pointerId) return;
    const point = caretPoint(document, event.clientX, event.clientY);
    if (
      point
      && root.contains(point.node)
      && (session.precisionBypass || pointHitsWordGlyph(point, event.clientX, event.clientY, options.locale))
    ) session.focus = point;
    if (!session.moved) {
      const distance = Math.hypot(event.clientX - session.startX, event.clientY - session.startY);
      session.moved = distance >= POINTER_MOVE_THRESHOLD
        || Boolean(session.anchor && session.focus && compareDomPoints(session.anchor, session.focus) !== 0);
    }
    if (!session.precisionBypass) scheduleSnap();
  };

  const finishPointer = (event: PointerEvent) => {
    if (!session || event.pointerId !== session.pointerId) return;
    const point = caretPoint(document, event.clientX, event.clientY);
    if (
      point
      && root.contains(point.node)
      && (session.precisionBypass || pointHitsWordGlyph(point, event.clientX, event.clientY, options.locale))
    ) session.focus = point;
    clearScheduledFrame();
    if (!session.precisionBypass) snapNow();
    session = null;
  };

  const onSelectionChange = () => {
    if (session && !session.precisionBypass) scheduleSnap();
  };

  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0 || event.detail < 3 || !isReadingTextTarget(root, event.target)) return;
    suppressSelectStartUntil = view.performance.now() + 350;
    event.preventDefault();
  };

  const onClick = (event: MouseEvent) => {
    if (event.button !== 0 || event.detail < 3 || !isReadingTextTarget(root, event.target)) return;
    event.preventDefault();
  };

  const onSelectStart = (event: Event) => {
    if (view.performance.now() <= suppressSelectStartUntil && isReadingTextTarget(root, event.target)) {
      event.preventDefault();
    }
  };

  root.addEventListener('pointerdown', onPointerDown as EventListener, true);
  document.addEventListener('pointermove', onPointerMove as EventListener, true);
  document.addEventListener('pointerup', finishPointer as EventListener, true);
  document.addEventListener('pointercancel', finishPointer as EventListener, true);
  document.addEventListener('selectionchange', onSelectionChange, true);
  root.addEventListener('mousedown', onMouseDown as EventListener, true);
  root.addEventListener('click', onClick as EventListener, true);
  root.addEventListener('selectstart', onSelectStart, true);

  return {
    snapNow,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearScheduledFrame();
      root.removeEventListener('pointerdown', onPointerDown as EventListener, true);
      document.removeEventListener('pointermove', onPointerMove as EventListener, true);
      document.removeEventListener('pointerup', finishPointer as EventListener, true);
      document.removeEventListener('pointercancel', finishPointer as EventListener, true);
      document.removeEventListener('selectionchange', onSelectionChange, true);
      root.removeEventListener('mousedown', onMouseDown as EventListener, true);
      root.removeEventListener('click', onClick as EventListener, true);
      root.removeEventListener('selectstart', onSelectStart, true);
      root.classList.remove('dawn-word-selection-surface');
    },
  };
}
