import Foundation

enum ReaderContentScript {
    static func install(mode: PencilMode) -> String {
        """
        (() => {
          if (window.__dawnReaderInstalled) return;
          window.__dawnReaderInstalled = true;

          const normalizeText = (root) => {
            if (!root) return;
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            const nodes = [];
            while (walker.nextNode()) nodes.push(walker.currentNode);
            for (const node of nodes) {
              if (node.parentElement?.closest('script, style')) continue;
              const clean = node.data
                .replace(/\\u0085/g, '…')
                .replace(/\\u0091/g, '‘')
                .replace(/na\\u0095ve/g, 'naïve')
                .replace(/\\u0095/g, '')
                .replace(/\\u008B/g, '')
                .replace(/Ph\\u0107drus/g, 'Phædrus')
                .replace(/of\\u0118technology/g, 'of technology')
                .replace(/pi\\u0144on/g, 'piñon')
                .replace(/Rub\\u0155iyat/g, 'Rubáiyat')
                .replace(/Khayy\\u0155m/g, 'Khayyám');
              if (clean !== node.data) node.data = clean;
            }
          };

          const style = document.createElement('style');
          style.id = 'dawn-reader-input-style';
          style.textContent = `
            ::selection {
              background: transparent !important;
              color: inherit !important;
            }
            ::highlight(dawn-reader-live-selection) {
              background-color: rgba(196, 117, 70, 0.34);
              color: inherit;
            }
            html[data-dawn-pencil-mode="page"],
            html[data-dawn-pencil-mode="page"] * {
              -webkit-user-select: none !important;
              user-select: none !important;
              -webkit-touch-callout: none !important;
            }
          `;
          document.head.appendChild(style);
          document.documentElement.dataset.dawnPencilMode = '\(mode.rawValue)';
          normalizeText(document.body);
          new MutationObserver((changes) => {
            for (const change of changes) {
              for (const node of change.addedNodes) normalizeText(node);
            }
          }).observe(document.body, { childList: true, subtree: true });
        })()
        """
    }

    static func setMode(_ mode: PencilMode) -> String {
        """
        (() => {
          document.documentElement.dataset.dawnPencilMode = '\(mode.rawValue)';
          if ('\(mode.rawValue)' === 'page') {
            window.getSelection()?.removeAllRanges();
            globalThis.CSS?.highlights?.delete('dawn-reader-live-selection');
          }
        })()
        """
    }

    static let clearSelection = """
    (() => {
      window.getSelection()?.removeAllRanges();
      globalThis.CSS?.highlights?.delete('dawn-reader-live-selection');
    })()
    """
}
