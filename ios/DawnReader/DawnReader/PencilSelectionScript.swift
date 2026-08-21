import CoreGraphics
import Foundation

enum PencilSelectionScript {
    static func make(start: CGPoint, end: CGPoint, nativeSize: CGSize, captureNative: Bool = true) -> String {
        let locale = Locale(identifier: "en_US_POSIX")
        func number(_ value: CGFloat) -> String {
            String(format: "%.3f", locale: locale, Double(value))
        }
        return """
        (() => {
          const nativeWidth = \(number(max(nativeSize.width, 1)));
          const nativeHeight = \(number(max(nativeSize.height, 1)));
          const scaleX = window.innerWidth / nativeWidth;
          const scaleY = window.innerHeight / nativeHeight;
          const captureNative = \(captureNative ? "true" : "false");
          const point = (nativeX, nativeY) => {
            const x = nativeX * scaleX;
            const y = nativeY * scaleY;
            if (document.caretPositionFromPoint) {
              const p = document.caretPositionFromPoint(x, y);
              if (p) return { node: p.offsetNode, offset: p.offset };
            }
            if (document.caretRangeFromPoint) {
              const r = document.caretRangeFromPoint(x, y);
              if (r) return { node: r.startContainer, offset: r.startOffset };
            }
            return null;
          };
          const glyphContainsPoint = (caret, x, y) => {
            if (!caret || caret.node.nodeType !== Node.TEXT_NODE) return null;
            const text = caret.node.data || "";
            const isWord = (char) => /[\\p{L}\\p{N}'’\\u2010-\\u2015-]/u.test(char || "");
            const candidates = [caret.offset, caret.offset - 1];
            for (const index of candidates) {
              if (index < 0 || index >= text.length || !isWord(text[index])) continue;
              const range = document.createRange();
              range.setStart(caret.node, index);
              range.setEnd(caret.node, index + 1);
              for (const rect of range.getClientRects()) {
                const pad = 1.5;
                if (rect.width > 0 && rect.height > 0 &&
                    x >= rect.left - pad && x <= rect.right + pad &&
                    y >= rect.top - pad && y <= rect.bottom + pad) {
                  return { node: caret.node, offset: index };
                }
              }
            }
            return null;
          };
          const startX = \(number(start.x)) * scaleX;
          const startY = \(number(start.y)) * scaleY;
          const a = glyphContainsPoint(point(\(number(start.x)), \(number(start.y))), startX, startY);
          const b = point(\(number(end.x)), \(number(end.y)));
          if (!a) {
            window.getSelection()?.removeAllRanges();
            globalThis.CSS?.highlights?.delete('dawn-reader-live-selection');
            return "";
          }
          if (!b) return window.getSelection()?.toString().trim() || "";
          globalThis.CSS?.highlights?.delete('dawn-reader-live-selection');
          const wordBounds = (caret) => {
            if (!caret || caret.node.nodeType !== Node.TEXT_NODE) return caret;
            const text = caret.node.data || "";
            const isWord = (char) => /[\\p{L}\\p{N}'’\\u2010-\\u2015-]/u.test(char || "");
            let offset = Math.min(Math.max(caret.offset, 0), text.length);
            if (!isWord(text[offset]) && isWord(text[offset - 1])) offset -= 1;
            let start = offset;
            let end = offset;
            while (start > 0 && isWord(text[start - 1])) start -= 1;
            while (end < text.length && isWord(text[end])) end += 1;
            return { node: caret.node, start, end };
          };
          const aw = wordBounds(a);
          const bw = wordBounds(b);
          if (!aw || !bw || aw.start === undefined || bw.start === undefined) return "";
          let forward = true;
          try {
            const ar = document.createRange();
            const br = document.createRange();
            ar.setStart(a.node, a.offset); ar.collapse(true);
            br.setStart(b.node, b.offset); br.collapse(true);
            forward = ar.compareBoundaryPoints(Range.START_TO_START, br) <= 0;
          } catch (_) {}
          const range = document.createRange();
          try {
            if (forward) {
              range.setStart(aw.node, aw.start);
              range.setEnd(bw.node, bw.end);
            } else {
              range.setStart(bw.node, bw.start);
              range.setEnd(aw.node, aw.end);
            }
          } catch (_) {
            return "";
          }
          const resolvedRange = globalThis.dawnWordSelection?.snapRange?.(range) || range;
          const hasCustomHighlight = Boolean(globalThis.CSS?.highlights && globalThis.Highlight);
          if (hasCustomHighlight) {
            CSS.highlights.set('dawn-reader-live-selection', new Highlight(resolvedRange.cloneRange()));
          }
          if (!captureNative && hasCustomHighlight) {
            return resolvedRange.toString().trim();
          }
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(resolvedRange.cloneRange());
          document.dispatchEvent(new Event("selectionchange"));
          return selection.toString().trim();
        })()

/* Dawn whole-word selection v2: pointer/Pencil-only, bounded and direction-safe. */
(function () {
  'use strict';
  if (window.__dawnWordSelectionV2) return;
  window.__dawnWordSelectionV2 = true;

  const LIMIT = 2048;
  const CONNECTOR = /^[\\u002D\\u0027\\u058A\\u2010\\u2011\\u2019\\u02BC\\u30A0]+$/u;
  const WORD_FALLBACK = /[\\p{L}\\p{M}\\p{N}]+(?:[\\u002D\\u0027\\u058A\\u2010\\u2011\\u2019\\u02BC\\u30A0][\\p{L}\\p{M}\\p{N}]+)*/gu;
  const EXCLUDED = 'a,button,input,textarea,select,option,audio,video,[role="button"],[role="link"],[contenteditable="true"],[data-dawn-selection-control]';

  function words(value) {
    let result = [];
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      try {
        for (const part of new Intl.Segmenter(undefined, { granularity: 'word' }).segment(value)) {
          if (part.isWordLike) result.push({ start: part.index, end: part.index + part.segment.length });
        }
      } catch (_) {}
    }
    if (!result.length) {
      let match;
      WORD_FALLBACK.lastIndex = 0;
      while ((match = WORD_FALLBACK.exec(value))) result.push({ start: match.index, end: match.index + match[0].length });
    }
    const merged = [];
    for (const word of result) {
      const previous = merged[merged.length - 1];
      const gap = previous ? value.slice(previous.end, word.start) : '';
      if (previous && gap && CONNECTOR.test(gap)) previous.end = word.end;
      else merged.push({ start: word.start, end: word.end });
    }
    return merged;
  }

  function usable(node) {
    return node && node.nodeType === Node.TEXT_NODE && node.data && !node.parentElement?.closest('script,style,noscript,textarea,input,select,[contenteditable="true"],[aria-hidden="true"]');
  }

  function textPoint(container, offset, forward) {
    if (usable(container)) return { node: container, offset: Math.max(0, Math.min(offset, container.length)) };
    if (!container?.childNodes) return null;
    const childText = (node, first) => {
      if (usable(node)) return node;
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, { acceptNode: n => usable(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
      let found = null, next;
      while ((next = walker.nextNode())) { found = next; if (first) break; }
      return found;
    };
    if (forward) {
      for (let i = offset; i < container.childNodes.length; i++) { const n = childText(container.childNodes[i], true); if (n) return { node: n, offset: 0 }; }
      for (let i = Math.min(offset, container.childNodes.length) - 1; i >= 0; i--) { const n = childText(container.childNodes[i], false); if (n) return { node: n, offset: n.length }; }
    } else {
      for (let i = Math.min(offset, container.childNodes.length) - 1; i >= 0; i--) { const n = childText(container.childNodes[i], false); if (n) return { node: n, offset: n.length }; }
      for (let i = offset; i < container.childNodes.length; i++) { const n = childText(container.childNodes[i], true); if (n) return { node: n, offset: 0 }; }
    }
    return null;
  }

  function block(node) {
    const tags = /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|DD|DIV|DT|FIGCAPTION|FIGURE|H[1-6]|HEADER|LI|MAIN|NAV|OL|P|PRE|SECTION|TABLE|TD|TH|TR|UL)$/;
    let element = node.parentElement;
    while (element && element !== document.body) { if (tags.test(element.tagName)) return element; element = element.parentElement; }
    return element;
  }

  function context(point, forward) {
    const resolved = textPoint(point.node, point.offset, forward);
    if (!resolved) return null;
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, { acceptNode: n => usable(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
    walker.currentNode = resolved.node;
    const before = [], after = [];
    let size = 0, n;
    while (size < LIMIT && (n = walker.previousNode())) { before.unshift(n); size += n.length + 1; }
    walker.currentNode = resolved.node; size = 0;
    while (size < LIMIT && (n = walker.nextNode())) { after.push(n); size += n.length + 1; }
    const nodes = before.concat([resolved.node], after), maps = [];
    let value = '', pointOffset = 0;
    nodes.forEach((node, index) => {
      if (index && !/\\s$/.test(nodes[index - 1].data) && !/^\\s/.test(node.data) && block(nodes[index - 1]) !== block(node)) value += '\\n';
      const start = value.length;
      value += node.data;
      maps.push({ node, start, end: value.length });
      if (node === resolved.node) pointOffset = start + resolved.offset;
    });
    return { value, pointOffset, maps };
  }

  function mapPoint(ctx, offset, forward) {
    const maps = forward ? ctx.maps : ctx.maps.slice().reverse();
    for (const map of maps) {
      if (forward && ((offset >= map.start && offset < map.end) || offset === map.start)) return { node: map.node, offset: Math.max(0, Math.min(offset - map.start, map.node.length)) };
      if (!forward && ((offset > map.start && offset <= map.end) || offset === map.end)) return { node: map.node, offset: Math.max(0, Math.min(offset - map.start, map.node.length)) };
    }
    return null;
  }

  function snapPoint(point, startEdge) {
    const ctx = context(point, startEdge);
    if (!ctx) return point;
    const list = words(ctx.value);
    let word = null;
    if (startEdge) {
      word = list.find(item => ctx.pointOffset >= item.start && ctx.pointOffset < item.end) || null;
    } else {
      for (let i = list.length - 1; i >= 0; i--) {
        const item = list[i];
        if (ctx.pointOffset > item.start && ctx.pointOffset <= item.end) { word = item; break; }
      }
    }
    if (!word) return point;
    return mapPoint(ctx, startEdge ? word.start : word.end, startEdge) || point;
  }

  function snapRange(range) {
    if (!range || range.collapsed) return range?.cloneRange ? range.cloneRange() : range;
    const copy = range.cloneRange();
    const start = snapPoint({ node: range.startContainer, offset: range.startOffset }, true);
    const end = snapPoint({ node: range.endContainer, offset: range.endOffset }, false);
    try { copy.setStart(start.node, start.offset); copy.setEnd(end.node, end.offset); } catch (_) {}
    return copy;
  }

  function before(aNode, aOffset, bNode, bOffset) {
    if (aNode === bNode) return aOffset <= bOffset;
    try {
      const a = document.createRange(), b = document.createRange();
      a.setStart(aNode, aOffset); a.collapse(true); b.setStart(bNode, bOffset); b.collapse(true);
      return a.compareBoundaryPoints(Range.START_TO_START, b) <= 0;
    } catch (_) { return true; }
  }

  function snapCurrentSelection() {
    const selection = getSelection();
    if (!selection?.anchorNode || !selection.focusNode || selection.isCollapsed) return false;
    const forward = before(selection.anchorNode, selection.anchorOffset, selection.focusNode, selection.focusOffset);
    const range = snapRange(selection.getRangeAt(0));
    try {
      const anchorNode = forward ? range.startContainer : range.endContainer;
      const anchorOffset = forward ? range.startOffset : range.endOffset;
      const focusNode = forward ? range.endContainer : range.startContainer;
      const focusOffset = forward ? range.endOffset : range.startOffset;
      if (selection.anchorNode === anchorNode && selection.anchorOffset === anchorOffset
          && selection.focusNode === focusNode && selection.focusOffset === focusOffset) return true;
      if (forward) selection.setBaseAndExtent(range.startContainer, range.startOffset, range.endContainer, range.endOffset);
      else selection.setBaseAndExtent(range.endContainer, range.endOffset, range.startContainer, range.startOffset);
      return true;
    } catch (_) { return false; }
  }

  const style = document.createElement('style');
  style.id = 'dawn-native-word-selection-style';
  style.textContent = `
    ::selection { background: rgba(215,166,82,.46) !important; color: inherit !important; text-shadow: none !important; }
    ::-moz-selection { background: rgba(215,166,82,.46) !important; color: inherit !important; text-shadow: none !important; }
    ::highlight(dawn-selection), ::highlight(dawn-pencil-selection), ::highlight(dawn-live-selection), ::highlight(dawn-pointer-selection) { background-color: rgba(215,166,82,.46); color: inherit; }
    @media (prefers-color-scheme: dark) { ::selection, ::-moz-selection { background: rgba(231,181,94,.38) !important; } }
  `;
  (document.head || document.documentElement).appendChild(style);

  let active = false, bypass = false, raf = 0;
  const schedule = () => { if (!active || bypass || raf) return; raf = requestAnimationFrame(() => { raf = 0; snapCurrentSelection(); }); };
  document.addEventListener('pointerdown', event => {
    const target = event.target;
    const style = target?.nodeType === Node.ELEMENT_NODE ? getComputedStyle(target) : null;
    const selectable = !style || (style.userSelect !== 'none' && style.webkitUserSelect !== 'none');
    if ((event.pointerType === 'pen' || event.pointerType === 'mouse') && event.button === 0 && selectable && !target?.closest?.(EXCLUDED)) {
      active = true; bypass = !!event.altKey;
    }
  }, true);
  document.addEventListener('pointermove', schedule, true);
  document.addEventListener('selectionchange', schedule, true);
  const sameRange = (selection, range) => selection?.rangeCount === 1 && !selection.isCollapsed
    && selection.getRangeAt(0).startContainer === range.startContainer
    && selection.getRangeAt(0).startOffset === range.startOffset
    && selection.getRangeAt(0).endContainer === range.endContainer
    && selection.getRangeAt(0).endOffset === range.endOffset;
  const hasDawnHighlight = () => {
    const registry = window.CSS?.highlights;
    if (!registry?.has) return false;
    return ['dawn-selection', 'dawn-pencil-selection', 'dawn-live-selection', 'dawn-pointer-selection']
      .some(name => registry.has(name));
  };
  const finish = () => {
    if (active && !bypass) snapCurrentSelection();
    const selection = getSelection();
    const captured = selection?.rangeCount && !selection.isCollapsed ? selection.getRangeAt(0).cloneRange() : null;
    if (captured) setTimeout(() => {
      const current = getSelection();
      if (captured.startContainer.isConnected && captured.endContainer.isConnected && sameRange(current, captured) && hasDawnHighlight()) current.removeAllRanges();
    }, 900);
    active = false; bypass = false;
  };
  document.addEventListener('pointerup', finish, true);
  document.addEventListener('pointercancel', finish, true);
  let suppressSelectStartUntil = 0;
  const suppressThird = event => {
    if (event.button === 0 && event.detail >= 3 && !event.target?.closest?.(EXCLUDED)) {
      suppressSelectStartUntil = performance.now() + 350;
      event.preventDefault();
    }
  };
  document.addEventListener('mousedown', suppressThird, true);
  document.addEventListener('click', suppressThird, true);
  document.addEventListener('selectstart', event => {
    if (performance.now() <= suppressSelectStartUntil && !event.target?.closest?.(EXCLUDED)) event.preventDefault();
  }, true);

  window.dawnWordSelection = Object.freeze({ words, snapRange, snapCurrentSelection });
})();

"""
    }

    static func hitTest(point: CGPoint, nativeSize: CGSize) -> String {
        let locale = Locale(identifier: "en_US_POSIX")
        func number(_ value: CGFloat) -> String {
            String(format: "%.3f", locale: locale, Double(value))
        }
        return """
        (() => {
          const x = \(number(point.x)) * window.innerWidth / \(number(max(nativeSize.width, 1)));
          const y = \(number(point.y)) * window.innerHeight / \(number(max(nativeSize.height, 1)));
          let caret = null;
          if (document.caretPositionFromPoint) {
            const p = document.caretPositionFromPoint(x, y);
            if (p) caret = { node: p.offsetNode, offset: p.offset };
          }
          if (!caret && document.caretRangeFromPoint) {
            const r = document.caretRangeFromPoint(x, y);
            if (r) caret = { node: r.startContainer, offset: r.startOffset };
          }
          if (!caret || caret.node.nodeType !== Node.TEXT_NODE) return false;
          const text = caret.node.data || "";
          for (const index of [caret.offset, caret.offset - 1]) {
            if (index < 0 || index >= text.length || /\\s/u.test(text[index])) continue;
            const range = document.createRange();
            range.setStart(caret.node, index);
            range.setEnd(caret.node, index + 1);
            for (const rect of range.getClientRects()) {
              if (rect.width > 0 && rect.height > 0 &&
                  x >= rect.left - 1.5 && x <= rect.right + 1.5 &&
                  y >= rect.top - 1.5 && y <= rect.bottom + 1.5) return true;
            }
          }
          return false;
        })()
        """
    }
}
