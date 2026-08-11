import CoreGraphics
import Foundation

enum PencilSelectionScript {
    static func make(start: CGPoint, end: CGPoint, nativeSize: CGSize) -> String {
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
            globalThis.CSS?.highlights?.delete('dawn-reader-selection');
            return "";
          }
          if (!b) return window.getSelection()?.toString().trim() || "";
          globalThis.CSS?.highlights?.delete('dawn-reader-selection');
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
          const selection = window.getSelection();
          selection.removeAllRanges();
          try {
            selection.setBaseAndExtent(
              aw.node, forward ? aw.start : aw.end,
              bw.node, forward ? bw.end : bw.start
            );
          } catch (_) {
            let range = document.createRange();
            try {
              if (forward) {
                range.setStart(aw.node, aw.start);
                range.setEnd(bw.node, bw.end);
              } else {
                range.setStart(bw.node, bw.start);
                range.setEnd(aw.node, aw.end);
              }
              selection.addRange(range);
            } catch (_) { return ""; }
          }
          document.dispatchEvent(new Event("selectionchange"));
          return selection.toString().trim();
        })()
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
