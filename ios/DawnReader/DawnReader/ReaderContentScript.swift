import Foundation

enum ReaderContentScript {
    static func install(
        mode: PencilMode,
        appearance: ReaderAppearance? = nil,
        isEnglish: Bool = false,
        allowsFingerSelection: Bool = false
    ) -> String {
        let effectiveAppearance = appearance ?? ReaderAppearance(
            fontSize: 1,
            lineHeight: 1.55,
            pageMargins: 1.15,
            theme: .paper,
            textAlign: .justify,
            paragraphStyle: .book,
            typographyMode: .dawn
        )
        return """
        (() => {
          if (window.__dawnReaderInstalled) return;
          window.__dawnReaderInstalled = true;

          const style = document.createElement('style');
          style.id = 'dawn-reader-input-style';
          style.textContent = `
            html[data-dawn-finger-selection="enabled"] ::selection {
              background: rgba(196, 117, 70, 0.34) !important;
              color: inherit !important;
            }
            html[data-dawn-finger-selection="disabled"] ::selection {
              background: transparent !important;
              color: inherit !important;
            }
            ::highlight(dawn-reader-live-selection) {
              background-color: rgba(196, 117, 70, 0.34);
              color: inherit;
            }
            html[data-dawn-finger-selection="disabled"][data-dawn-pencil-mode="page"],
            html[data-dawn-finger-selection="disabled"][data-dawn-pencil-mode="page"] * {
              -webkit-user-select: none !important;
              user-select: none !important;
              -webkit-touch-callout: none !important;
            }
          `;
          document.head.appendChild(style);

          const authoredAlignment = element => {
            const align = (element.getAttribute('align') || '').toLowerCase();
            const inline = (element.style?.textAlign || '').toLowerCase();
            const signature = `${element.getAttribute('class') || ''} ${element.id || ''}`;
            const explicitPattern = /(?:^|[\\s_-])(center|centered|right|end)(?:$|[\\s_-])/i;
            return ['center', 'right', 'end'].includes(align)
              || ['center', 'right', 'end'].includes(inline)
              || explicitPattern.test(signature);
          };
          const markElement = element => {
            element.dataset.dawnTypographyExempt = 'true';
            if (authoredAlignment(element)) element.dataset.dawnPreserveAlign = 'true';
            element.querySelectorAll('p, li, dt, dd, figcaption, th, td').forEach(descendant => {
              descendant.dataset.dawnTypographyExempt = 'true';
              if (authoredAlignment(descendant)) descendant.dataset.dawnPreserveAlign = 'true';
            });
          };
          const markTypography = () => {
            document.querySelectorAll('h1, h2, h3, h4, h5, h6, pre, code, kbd, samp, math, table, figure, figcaption, nav, aside, blockquote, dt, dd, th, td').forEach(markElement);
            const semanticPattern = /(?:^|[\\s_-])(poem|poetry|verse|stanza|linegroup|line-group|lyrics?|dedication|epigraph|titlepage|subtitle|caption|code|formula|math|table|toc|contents|footnote|endnote|bibliograph|drama|stage|speaker|letter)(?:$|[\\s_-])/i;
            document.querySelectorAll('[class], [id], [role], *').forEach(element => {
              const signature = [element.className, element.id, element.getAttribute('role'), element.getAttribute('epub:type')]
                .filter(Boolean).join(' ');
              if (semanticPattern.test(signature)) markElement(element);
            });
            document.querySelectorAll('p').forEach(paragraph => {
              if (paragraph.querySelectorAll('br').length >= 2) markElement(paragraph);
            });
            const blockContent = ':scope > p, :scope > div, :scope > section, :scope > article, :scope > aside, :scope > blockquote, :scope > figure, :scope > table, :scope > ul, :scope > ol, :scope > dl, :scope > pre, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6';
            const mediaContent = 'img, video, audio, iframe, svg, canvas, math, input, textarea, select, button';
            document.querySelectorAll('div:not([data-dawn-typography-exempt])').forEach(element => {
              const text = element.textContent || '';
              if (text.trim().length < 20 || element.querySelector(blockContent) || element.querySelector(mediaContent)) return;
              element.dataset.dawnBodyBlock = 'true';
              const leadingWhitespace = text.match(/^[\\s\\u00a0]*/u)?.[0] || '';
              if ((leadingWhitespace.match(/\\u00a0/gu) || []).length >= 2) element.dataset.dawnSourceIndent = 'true';
            });
            const noIndentPattern = /(?:^|[\\s_-])(noindent|no-indent|first|firstpara|first-para|opening|lead)(?:$|[\\s_-])/i;
            const openingPredecessor = 'h1, h2, h3, h4, h5, h6, hr, figure, table, blockquote, aside';
            document.querySelectorAll('p:not([data-dawn-typography-exempt]), [data-dawn-body-block]').forEach(paragraph => {
              const previous = paragraph.previousElementSibling;
              const signature = `${paragraph.className} ${paragraph.id}`;
              if (noIndentPattern.test(signature)
                || (paragraph.parentElement === document.body && !previous)
                || previous?.matches(openingPredecessor)) {
                paragraph.dataset.dawnOpeningParagraph = 'true';
              }
            });
          };

          const typographyStyle = document.createElement('style');
          typographyStyle.id = 'dawn-reader-typography';
          typographyStyle.textContent = `
            :root[data-dawn-typography-mode="dawn"][data-dawn-language="english"] {
              font-family: "Iowan Old Style", Baskerville, Georgia, serif !important;
              font-kerning: normal;
              text-rendering: optimizeLegibility;
            }
            :root[data-dawn-typography-mode="dawn"][data-dawn-language="english"][data-dawn-text-align="justify"] :is(p:not([data-dawn-typography-exempt]), [data-dawn-body-block]) {
              text-align: justify !important;
              -webkit-hyphens: auto !important;
              hyphens: auto !important;
            }
            :root[data-dawn-typography-mode="dawn"][data-dawn-language="english"][data-dawn-text-align="start"] :is(p:not([data-dawn-typography-exempt]), [data-dawn-body-block]) {
              text-align: start !important;
              -webkit-hyphens: none !important;
              hyphens: none !important;
            }
            :root[data-dawn-typography-mode="dawn"][data-dawn-language="english"] :is(p:not([data-dawn-typography-exempt]), [data-dawn-body-block]) {
              padding-right: 0 !important;
              padding-left: 0 !important;
              letter-spacing: normal !important;
              word-spacing: normal !important;
              font-family: inherit !important;
              font-size: inherit !important;
              line-height: inherit !important;
              orphans: 2;
              widows: 2;
              text-wrap: pretty;
            }
            :root[data-dawn-typography-mode="dawn"][data-dawn-language="english"] p[data-dawn-typography-exempt] {
              margin-top: 0 !important;
              margin-bottom: .75em !important;
              padding-right: 0 !important;
              padding-left: 0 !important;
              text-indent: 0 !important;
              letter-spacing: normal !important;
              word-spacing: normal !important;
            }
            :root[data-dawn-typography-mode="dawn"][data-dawn-language="english"][data-dawn-paragraph-style="book"] :is(p:not([data-dawn-typography-exempt]), [data-dawn-body-block]) {
              margin-top: 0 !important;
              margin-bottom: 0 !important;
              text-indent: 1.25em !important;
              orphans: 2;
              widows: 2;
              text-wrap: pretty;
            }
            :root[data-dawn-typography-mode="dawn"][data-dawn-language="english"][data-dawn-paragraph-style="book"] :is(p[data-dawn-opening-paragraph], [data-dawn-body-block][data-dawn-opening-paragraph], [data-dawn-body-block][data-dawn-source-indent]) {
              text-indent: 0 !important;
            }
            :root[data-dawn-typography-mode="dawn"][data-dawn-language="english"][data-dawn-paragraph-style="spaced"] :is(p:not([data-dawn-typography-exempt]), [data-dawn-body-block]) {
              margin-top: 0 !important;
              margin-bottom: .75em !important;
              text-indent: 0 !important;
            }
            :root[data-dawn-typography-mode="dawn"][data-dawn-language="english"] :is(h1, h2, h3, h4, h5, h6):not([data-dawn-preserve-align]),
            :root[data-dawn-typography-mode="dawn"][data-dawn-language="english"] :is(li, dt, dd, figcaption, th, td):not([data-dawn-preserve-align]),
            :root[data-dawn-typography-mode="dawn"][data-dawn-language="english"] [data-dawn-typography-exempt]:not([data-dawn-preserve-align]) {
              text-align: start !important;
            }
            :root[data-dawn-typography-mode="dawn"][data-dawn-language="english"] :is(h1, h2, h3, h4, h5, h6),
            :root[data-dawn-typography-mode="dawn"][data-dawn-language="english"] [data-dawn-typography-exempt] {
              -webkit-hyphens: none !important;
              hyphens: none !important;
            }
            :root[data-dawn-typography-mode="dawn"][data-dawn-language="english"] :is(h1, h2, h3, h4, h5, h6) {
              font-family: inherit !important;
              line-height: 1.15 !important;
              letter-spacing: normal !important;
              word-spacing: normal !important;
              break-after: avoid-page;
              page-break-after: avoid;
              text-wrap: balance;
            }
            :root[data-dawn-typography-mode="dawn"][data-dawn-language="english"] :is(pre, code, kbd, samp) {
              font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace !important;
              overflow-wrap: anywhere;
              white-space: pre-wrap;
            }
            :root[data-dawn-typography-mode="dawn"] :is(img, svg, video, table) { max-width: 100% !important; }
            :root[data-dawn-typography-mode="dawn"] :is(a, code, pre, td, th) { overflow-wrap: anywhere; }
          `;
          document.head.appendChild(typographyStyle);

          const applyTypography = options => {
            document.documentElement.dataset.dawnTypographyMode = options.mode;
            document.documentElement.dataset.dawnLanguage = options.english ? 'english' : 'other';
            document.documentElement.dataset.dawnTextAlign = options.textAlign;
            document.documentElement.dataset.dawnParagraphStyle = options.paragraphStyle;
            markTypography();
          };
          window.__dawnApplyTypography = applyTypography;
          applyTypography({
            mode: '\(effectiveAppearance.typographyMode.rawValue)',
            english: \(isEnglish ? "true" : "false"),
            textAlign: '\(effectiveAppearance.textAlign.rawValue)',
            paragraphStyle: '\(effectiveAppearance.paragraphStyle.rawValue)'
          });
          document.documentElement.dataset.dawnFingerSelection = '\(allowsFingerSelection ? "enabled" : "disabled")';
          document.documentElement.dataset.dawnPencilMode = '\(mode.rawValue)';
        })()
        """
    }

    static func setMode(_ mode: PencilMode, allowsFingerSelection: Bool = false) -> String {
        """
        (() => {
          const allowsFingerSelection = \(allowsFingerSelection ? "true" : "false");
          document.documentElement.dataset.dawnFingerSelection = allowsFingerSelection ? 'enabled' : 'disabled';
          document.documentElement.dataset.dawnPencilMode = '\(mode.rawValue)';
          if ('\(mode.rawValue)' === 'page' && !allowsFingerSelection) {
            window.getSelection()?.removeAllRanges();
            globalThis.CSS?.highlights?.delete('dawn-reader-live-selection');
          }
        })()
        """
    }

    static func setTypography(appearance: ReaderAppearance, isEnglish: Bool) -> String {
        """
        (() => {
          window.__dawnApplyTypography?.({
            mode: '\(appearance.typographyMode.rawValue)',
            english: \(isEnglish ? "true" : "false"),
            textAlign: '\(appearance.textAlign.rawValue)',
            paragraphStyle: '\(appearance.paragraphStyle.rawValue)'
          });
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
