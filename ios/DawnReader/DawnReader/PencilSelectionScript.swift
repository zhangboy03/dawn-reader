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
          const a = point(\(number(start.x)), \(number(start.y)));
          const b = point(\(number(end.x)), \(number(end.y)));
          if (!a || !b) return "";
          const selection = window.getSelection();
          selection.removeAllRanges();
          try {
            selection.setBaseAndExtent(a.node, a.offset, b.node, b.offset);
          } catch (_) {
            let range = document.createRange();
            try {
              range.setStart(a.node, a.offset);
              range.setEnd(b.node, b.offset);
              if (range.collapsed) {
                range = document.createRange();
                range.setStart(b.node, b.offset);
                range.setEnd(a.node, a.offset);
              }
              selection.addRange(range);
            } catch (_) { return ""; }
          }
          document.dispatchEvent(new Event("selectionchange"));
          return selection.toString().trim();
        })()
        """
    }
}
