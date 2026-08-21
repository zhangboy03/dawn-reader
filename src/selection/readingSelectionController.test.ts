// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureWarmSelectionStyle,
  installReadingSelectionController,
} from './readingSelectionController';

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;

  constructor(type: string, init: MouseEventInit & { pointerId?: number; pointerType?: string } = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'mouse';
  }
}


function node(): Text {
  const value = document.querySelector('#text')?.firstChild;
  if (!value || value.nodeType !== Node.TEXT_NODE) throw new Error('text missing');
  return value as Text;
}

function setPartialSelection() {
  const selection = window.getSelection()!;
  const value = node();
  selection.removeAllRanges();
  if (typeof selection.setBaseAndExtent === 'function') selection.setBaseAndExtent(value, 2, value, 8);
  else {
    const range = document.createRange();
    range.setStart(value, 2);
    range.setEnd(value, 8);
    selection.addRange(range);
  }
  return selection;
}

function pointer(type: string, x: number, options: { altKey?: boolean; pointerType?: string } = {}) {
  return new TestPointerEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    clientX: x,
    clientY: 5,
    pointerId: 7,
    pointerType: options.pointerType ?? 'mouse',
    altKey: options.altKey,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<main id="root"><span id="text">alpha beta</span><button id="button">Control</button></main>';
  window.getSelection()?.removeAllRanges();
  Object.defineProperty(window, 'PointerEvent', { configurable: true, value: TestPointerEvent });
  Object.defineProperty(document, 'caretPositionFromPoint', {
    configurable: true,
    value: (x: number) => ({ offsetNode: node(), offset: x < 50 ? 2 : x < 70 ? 5 : 8 }),
  });
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value(this: Range) {
      return this.startOffset < 5
        ? [{ left: 0, right: 45, top: 0, bottom: 20, width: 45, height: 20 }]
        : [{ left: 70, right: 120, top: 0, bottom: 20, width: 50, height: 20 }];
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('triple-click suppression', () => {
  it('suppresses the third click on reading text but keeps double-click', () => {
    const root = document.querySelector('#root')!;
    const controller = installReadingSelectionController(root);
    const double = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, detail: 2 });
    document.querySelector('#text')!.dispatchEvent(double);
    expect(double.defaultPrevented).toBe(false);

    const triple = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, detail: 3 });
    document.querySelector('#text')!.dispatchEvent(triple);
    expect(triple.defaultPrevented).toBe(true);
    controller.destroy();
  });

  it('does not suppress clicks on controls inside the reading surface', () => {
    const controller = installReadingSelectionController(document.querySelector('#root')!);
    const triple = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, detail: 3 });
    document.querySelector('#button')!.dispatchEvent(triple);
    expect(triple.defaultPrevented).toBe(false);
    controller.destroy();
  });
});

describe('pointer-only live snapping', () => {
  it('snaps a mouse drag and expands both touched words', () => {
    const root = document.querySelector('#root')!;
    const controller = installReadingSelectionController(root);
    root.dispatchEvent(pointer('pointerdown', 10));
    document.dispatchEvent(pointer('pointermove', 100));
    expect(controller.snapNow()).toBe(true);
    expect(window.getSelection()?.toString()).toBe('alpha beta');
    controller.destroy();
  });

  it('supports a pen pointer', () => {
    const root = document.querySelector('#root')!;
    const controller = installReadingSelectionController(root);
    root.dispatchEvent(pointer('pointerdown', 10, { pointerType: 'pen' }));
    document.dispatchEvent(pointer('pointermove', 100, { pointerType: 'pen' }));
    controller.snapNow();
    expect(window.getSelection()?.toString()).toBe('alpha beta');
    controller.destroy();
  });

  it('does not start whole-word snapping from outside word glyph geometry', () => {
    const root = document.querySelector('#root')!;
    const controller = installReadingSelectionController(root);
    root.dispatchEvent(pointer('pointerdown', 200));
    document.dispatchEvent(pointer('pointermove', 100));
    expect(controller.snapNow()).toBe(false);
    expect(window.getSelection()?.isCollapsed).toBe(true);
    controller.destroy();
  });

  it('keeps the last whole-word endpoint while the pointer crosses whitespace', () => {
    const root = document.querySelector('#root')!;
    const controller = installReadingSelectionController(root);
    root.dispatchEvent(pointer('pointerdown', 10));
    document.dispatchEvent(pointer('pointermove', 100));
    controller.snapNow();
    expect(window.getSelection()?.toString()).toBe('alpha beta');

    document.dispatchEvent(pointer('pointermove', 60));
    controller.snapNow();
    expect(window.getSelection()?.toString()).toBe('alpha beta');
    controller.destroy();
  });

  it('does not alter keyboard-created character-precise selection', () => {
    const controller = installReadingSelectionController(document.querySelector('#root')!);
    const selection = setPartialSelection();
    document.dispatchEvent(new Event('selectionchange'));
    expect(controller.snapNow()).toBe(false);
    expect(selection.toString()).toBe('pha be');
    controller.destroy();
  });

  it('uses Alt/Option as a character-precision bypass for a mouse drag', () => {
    const root = document.querySelector('#root')!;
    const controller = installReadingSelectionController(root);
    setPartialSelection();
    root.dispatchEvent(pointer('pointerdown', 10, { altKey: true }));
    document.dispatchEvent(pointer('pointermove', 100, { altKey: true }));
    expect(controller.snapNow()).toBe(false);
    expect(window.getSelection()?.toString()).toBe('pha be');
    controller.destroy();
  });
});

describe('single-layer warm selection', () => {
  it('styles the native selection without adding a replacement layer', () => {
    const style = ensureWarmSelectionStyle(document);
    expect(style.textContent).toContain('rgba(215, 166, 82, 0.46)');
    expect(style.textContent).toContain('::-moz-selection');
    expect(style.textContent).not.toContain('::highlight');
  });

  it('keeps the exact live native range after pointerup', () => {
    const root = document.querySelector('#root')!;
    const controller = installReadingSelectionController(root);
    root.dispatchEvent(pointer('pointerdown', 10));
    document.dispatchEvent(pointer('pointermove', 100));
    document.dispatchEvent(pointer('pointerup', 100));
    expect(window.getSelection()?.toString()).toBe('alpha beta');
    expect(window.getSelection()?.rangeCount).toBe(1);
    controller.destroy();
  });
});
