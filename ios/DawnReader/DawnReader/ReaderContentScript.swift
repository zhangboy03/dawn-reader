import Foundation

enum ReaderContentScript {
    static func install(mode: PencilMode) -> String {
        """
        (() => {
          if (window.__dawnReaderInstalled) return;
          window.__dawnReaderInstalled = true;

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
            html,
            html * {
              -webkit-user-select: none !important;
              user-select: none !important;
              -webkit-touch-callout: none !important;
            }
          `;
          document.head.appendChild(style);
          document.documentElement.dataset.dawnPencilMode = '\(mode.rawValue)';
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
