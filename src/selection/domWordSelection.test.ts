// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  expandRangeToWholeWords,
  snapSelectionToWholeWords,
} from './domWordSelection';

function text(selector: string): Text {
  const node = document.querySelector(selector)?.firstChild;
  if (!node || node.nodeType !== Node.TEXT_NODE) throw new Error(`Missing text node: ${selector}`);
  return node as Text;
}

function setSelection(anchor: Text, anchorOffset: number, focus: Text, focusOffset: number) {
  const selection = window.getSelection();
  if (!selection) throw new Error('Selection unavailable');
  selection.removeAllRanges();
  if (typeof selection.setBaseAndExtent === 'function') {
    selection.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset);
  } else {
    const range = document.createRange();
    const forward = anchor === focus ? anchorOffset <= focusOffset : Boolean(anchor.compareDocumentPosition(focus) & Node.DOCUMENT_POSITION_FOLLOWING);
    const start = forward ? anchor : focus;
    const startOffset = forward ? anchorOffset : focusOffset;
    const end = forward ? focus : anchor;
    const endOffset = forward ? focusOffset : anchorOffset;
    range.setStart(start, startOffset);
    range.setEnd(end, endOffset);
    selection.addRange(range);
    if (!forward && typeof selection.extend === 'function') {
      selection.collapse(anchor, anchorOffset);
      selection.extend(focus, focusOffset);
    }
  }
  return selection;
}

beforeEach(() => {
  document.body.innerHTML = '';
  window.getSelection()?.removeAllRanges();
});

describe('snapSelectionToWholeWords', () => {
  it('expands a forward drag that begins and ends mid-word', () => {
    document.body.innerHTML = '<main id="root"><span id="a">alpha</span> <span id="b">beta</span></main>';
    const selection = setSelection(text('#a'), 2, text('#b'), 2);
    expect(snapSelectionToWholeWords(selection, document.querySelector('#root')!)).toBe(true);
    expect(selection.toString()).toBe('alpha beta');
    expect(selection.anchorOffset).toBe(0);
    expect(selection.focusOffset).toBe(4);
  });

  it('preserves a backward drag and keeps anchor/focus direction', () => {
    document.body.innerHTML = '<main id="root"><span id="a">alpha</span> <span id="b">beta</span></main>';
    const a = text('#a');
    const b = text('#b');
    const state: { anchorNode: Node; anchorOffset: number; focusNode: Node; focusOffset: number } = {
      anchorNode: b, anchorOffset: 2, focusNode: a, focusOffset: 2,
    };
    const selection = {
      get anchorNode() { return state.anchorNode; },
      get anchorOffset() { return state.anchorOffset; },
      get focusNode() { return state.focusNode; },
      get focusOffset() { return state.focusOffset; },
      get isCollapsed() { return state.anchorNode === state.focusNode && state.anchorOffset === state.focusOffset; },
      setBaseAndExtent(anchorNode: Node, anchorOffset: number, focusNode: Node, focusOffset: number) {
        Object.assign(state, { anchorNode, anchorOffset, focusNode, focusOffset });
      },
    } as unknown as Selection;
    expect(snapSelectionToWholeWords(selection, document.querySelector('#root')!)).toBe(true);
    expect(state.anchorNode).toBe(b);
    expect(state.anchorOffset).toBe(4);
    expect(state.focusNode).toBe(a);
    expect(state.focusOffset).toBe(0);
    const range = document.createRange();
    range.setStart(state.focusNode, state.focusOffset);
    range.setEnd(state.anchorNode, state.anchorOffset);
    expect(range.toString()).toBe('alpha beta');
  });

  it('keeps punctuation outside touched endpoint words while retaining punctuation between them', () => {
    document.body.innerHTML = '<main id="root"><span id="t">“can\'t,” state-of-the-art.</span></main>';
    const node = text('#t');
    const selection = setSelection(node, 3, node, node.data.indexOf('art') + 1);
    snapSelectionToWholeWords(selection, document.querySelector('#root')!);
    expect(selection.toString()).toBe("can't,” state-of-the-art");
  });

  it('handles Unicode letters', () => {
    document.body.innerHTML = '<main id="root"><span id="t">naïve café Привет</span></main>';
    const node = text('#t');
    const selection = setSelection(node, 2, node, node.data.indexOf('Привет') + 2);
    snapSelectionToWholeWords(selection, document.querySelector('#root')!);
    expect(selection.toString()).toBe('naïve café Привет');
  });

  it('leaves a lower endpoint in whitespace precise instead of jumping words', () => {
    document.body.innerHTML = '<main id="root"><span id="t">alpha  beta gamma</span></main>';
    const node = text('#t');
    const selection = setSelection(node, 6, node, node.data.indexOf('gamma') + 2);
    snapSelectionToWholeWords(selection, document.querySelector('#root')!);
    expect(selection.toString()).toBe(' beta gamma');
  });

  it('treats one word split across inline DOM nodes as one word', () => {
    document.body.innerHTML = '<main id="root"><p><span id="a">inter</span><em id="b">national</em> <span id="c">law</span></p></main>';
    const selection = setSelection(text('#a'), 2, text('#c'), 1);
    snapSelectionToWholeWords(selection, document.querySelector('#root')!);
    expect(selection.toString()).toBe('international law');
    expect(selection.anchorNode).toBe(text('#a'));
    expect(selection.anchorOffset).toBe(0);
    expect(selection.focusNode).toBe(text('#c'));
    expect(selection.focusOffset).toBe(3);
  });

  it('supports PDF.js text layers whose words are split into spans', () => {
    document.body.innerHTML = '<div id="root" class="textLayer"><span id="a">inter</span><span id="b">national</span><span> </span><span id="c">evidence</span></div>';
    const selection = setSelection(text('#a'), 1, text('#c'), 3);
    snapSelectionToWholeWords(selection, document.querySelector('#root')!);
    expect(selection.toString()).toBe('international evidence');
  });

  it('does not rewrite an already-snapped selection on every selectionchange', () => {
    document.body.innerHTML = '<main id="root"><span id="t">alpha beta</span></main>';
    const value = text('#t');
    let writes = 0;
    const selection = {
      anchorNode: value,
      anchorOffset: 0,
      focusNode: value,
      focusOffset: value.length,
      isCollapsed: false,
      setBaseAndExtent() { writes += 1; },
    } as unknown as Selection;
    expect(snapSelectionToWholeWords(selection, document.querySelector('#root')!)).toBe(true);
    expect(writes).toBe(0);
  });
});

describe('expandRangeToWholeWords', () => {
  it('returns an expanded clone and leaves the source Range unchanged', () => {
    document.body.innerHTML = '<main id="root"><span id="t">alpha beta</span></main>';
    const node = text('#t');
    const range = document.createRange();
    range.setStart(node, 2);
    range.setEnd(node, 8);
    const expanded = expandRangeToWholeWords(range, document.querySelector('#root')!);
    expect(expanded.toString()).toBe('alpha beta');
    expect(range.toString()).toBe('pha be');
  });
});
