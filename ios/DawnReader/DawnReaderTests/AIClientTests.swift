import XCTest
@testable import DawnReader

final class AIClientTests: XCTestCase {
    func testPromptKeepsSelectionSeparateFromContext() throws {
        let body = AIClient.makeBody(
            context: .init(before: "before", highlight: "selected sentence", after: "after"),
            title: "Book",
            model: "qwen3.7-flash"
        )
        XCTAssertEqual(body.model, "qwen3.7-flash")
        XCTAssertEqual(body.stream, false)
        XCTAssertEqual(body.enableThinking, false)
        XCTAssertTrue(body.messages[1].content.contains("<selection>\nselected sentence\n</selection>"))
        XCTAssertTrue(body.messages[1].content.contains("<context_before>\nbefore\n</context_before>"))
    }

    func testSingleWordPromptKeepsOriginalContextualMeaningFormat() {
        let body = AIClient.makeBody(
            context: .init(before: "the pursuit of", highlight: "quality", after: "in work"),
            title: "Book",
            model: "qwen3.7-flash"
        )
        XCTAssertEqual(body.maxTokens, 48)
        XCTAssertTrue(body.messages[0].content.contains("Explain only the word"))
        XCTAssertTrue(body.messages[0].content.contains("selected word /IPA/"))
        XCTAssertTrue(body.messages[0].content.contains("contextual meaning in clear B1–B2 English"))
        XCTAssertTrue(body.messages[0].content.contains("Never rewrite, summarize, or quote the surrounding"))
        XCTAssertTrue(AIClient.isSingleWord("self-reliance"))
        XCTAssertFalse(AIClient.isSingleWord("a difficult phrase"))
        XCTAssertFalse(AIClient.isSingleWord("2026"))
    }

    func testPassagePromptStillRewritesOnlySelection() {
        let body = AIClient.makeBody(
            context: .init(before: "before", highlight: "This selected passage contains more than eight separate words for the reader.", after: "after"),
            title: "Book",
            model: "qwen3.7-flash"
        )
        XCTAssertEqual(body.maxTokens, 96)
        XCTAssertTrue(body.messages[0].content.contains("Rewrite only the text inside <selection>"))
    }

    func testChineseWordPromptExplainsOnlyTheSelectedWord() {
        let body = AIClient.makeChineseBody(
            context: .init(before: "the pursuit of", highlight: "quality", after: "in work"),
            title: "Book",
            model: "qwen3.7-flash"
        )
        XCTAssertEqual(body.maxTokens, 320)
        XCTAssertTrue(body.messages[0].content.contains("one selected English word in Chinese"))
        XCTAssertTrue(body.messages[0].content.contains("本义：…"))
        XCTAssertTrue(body.messages[0].content.contains("此处：…"))
        XCTAssertTrue(body.messages[0].content.contains("not its historical etymology"))
        XCTAssertTrue(body.messages[0].content.contains("Never translate or summarize the surrounding"))
    }

    func testChinesePassagePromptTranslatesThenExplains() {
        let body = AIClient.makeChineseBody(
            context: .init(before: "before", highlight: "This selected passage contains more than eight separate words for the reader.", after: "after"),
            title: "Book",
            model: "qwen3.7-flash"
        )
        XCTAssertTrue(body.messages[0].content.contains("First give an accurate, natural Chinese translation"))
        XCTAssertTrue(body.messages[0].content.contains("翻译："))
        XCTAssertTrue(body.messages[0].content.contains("解释："))
    }

    func testChatPromptKeepsSelectionAndConversationHistory() {
        let body = AIClient.makeChatBody(
            context: .init(before: "before", highlight: "课程原文", after: "after"),
            title: "Course",
            messages: [.init(role: "user", content: "这句话是什么意思？")],
            model: "qwen3.7-flash"
        )
        XCTAssertEqual(body.maxTokens, 700)
        XCTAssertTrue(body.messages[1].content.contains("<selection>\n课程原文\n</selection>"))
        XCTAssertEqual(body.messages.last?.role, "user")
        XCTAssertEqual(body.messages.last?.content, "这句话是什么意思？")
        XCTAssertTrue(body.messages[0].content.contains("no live web access"))
    }

    func testSelectionScriptUsesBothCaretAPIs() {
        let script = PencilSelectionScript.make(
            start: CGPoint(x: 20, y: 30),
            end: CGPoint(x: 120, y: 34),
            nativeSize: CGSize(width: 1024, height: 700)
        )
        XCTAssertTrue(script.contains("caretPositionFromPoint"))
        XCTAssertTrue(script.contains("caretRangeFromPoint"))
        XCTAssertTrue(script.contains("wordBounds"))
        XCTAssertTrue(script.contains("glyphContainsPoint"))
        XCTAssertTrue(script.contains("\\p{L}"))
        XCTAssertTrue(script.contains("selectionchange"))

        let liveScript = PencilSelectionScript.make(
            start: CGPoint(x: 20, y: 30),
            end: CGPoint(x: 120, y: 34),
            nativeSize: CGSize(width: 1024, height: 700),
            captureNative: false
        )
        XCTAssertTrue(liveScript.contains("const captureNative = false"))
        XCTAssertTrue(liveScript.contains("CSS.highlights.set('dawn-reader-live-selection'"))

        let hitTest = PencilSelectionScript.hitTest(
            point: CGPoint(x: 30, y: 40),
            nativeSize: CGSize(width: 1024, height: 700)
        )
        XCTAssertTrue(hitTest.contains("getClientRects"))
        XCTAssertTrue(hitTest.contains("return false"))
    }

    func testReaderContentScriptPreservesBookTextAndControlsSelectionMode() {
        let install = ReaderContentScript.install(mode: .page)
        XCTAssertFalse(install.contains("createTreeWalker"))
        XCTAssertFalse(install.contains("MutationObserver"))
        XCTAssertFalse(install.contains(".replace("))
        XCTAssertTrue(install.contains("dataset.dawnPencilMode"))
        XCTAssertTrue(install.contains("user-select: none"))
        XCTAssertTrue(install.contains("html[data-dawn-finger-selection=\"disabled\"][data-dawn-pencil-mode=\"page\"]"))
        XCTAssertTrue(install.contains("data-dawn-typography-mode"))
        XCTAssertTrue(install.contains("data-dawn-typography-exempt"))
        XCTAssertTrue(install.contains("poem|poetry|verse"))
        XCTAssertTrue(install.contains("text-indent: 1.25em"))

        let selectMode = ReaderContentScript.setMode(.select)
        XCTAssertTrue(selectMode.contains("'select'"))
        let pageMode = ReaderContentScript.setMode(.page)
        XCTAssertTrue(pageMode.contains("removeAllRanges"))
        XCTAssertTrue(ReaderContentScript.install(mode: .select).contains("::highlight(dawn-reader-live-selection)"))
        XCTAssertTrue(ReaderContentScript.clearSelection.contains("highlights?.delete"))
    }

    @MainActor
    func testEnglishDawnTypographyUsesResponsiveJustifiedBookSettings() {
        let appearance = ReaderAppearance(
            fontSize: 1,
            lineHeight: 1.55,
            pageMargins: 1.15,
            theme: .paper,
            textAlign: .justify,
            paragraphStyle: .book,
            typographyMode: .dawn
        )
        let preferences = ReaderHostViewController.preferences(for: appearance, language: "en-US")

        XCTAssertEqual(preferences.columnCount, .auto)
        XCTAssertEqual(preferences.spread, nil)
        XCTAssertEqual(preferences.textAlign, .justify)
        XCTAssertEqual(preferences.hyphens, true)
        XCTAssertEqual(preferences.paragraphIndent, 1.25)
        XCTAssertEqual(preferences.paragraphSpacing, 0)
        XCTAssertEqual(preferences.publisherStyles, false)
        XCTAssertEqual(preferences.textNormalization, true)
    }

    @MainActor
    func testNonEnglishAndPublisherTypographyDoNotUseEnglishHyphenation() {
        let dawn = ReaderAppearance(
            fontSize: 1,
            lineHeight: 1.55,
            pageMargins: 1.15,
            theme: .paper,
            textAlign: .justify,
            paragraphStyle: .book,
            typographyMode: .dawn
        )
        let chinese = ReaderHostViewController.preferences(for: dawn, language: "zh-Hant")
        XCTAssertEqual(chinese.textAlign, .start)
        XCTAssertEqual(chinese.hyphens, false)
        XCTAssertEqual(chinese.paragraphIndent, 0)
        XCTAssertEqual(chinese.paragraphSpacing, 0.75)

        let publisher = ReaderAppearance(
            fontSize: 1,
            lineHeight: 1.55,
            pageMargins: 1.15,
            theme: .paper,
            textAlign: .justify,
            paragraphStyle: .book,
            typographyMode: .publisher
        )
        let original = ReaderHostViewController.preferences(for: publisher, language: "en")
        XCTAssertNil(original.fontFamily)
        XCTAssertNil(original.textAlign)
        XCTAssertNil(original.hyphens)
        XCTAssertNil(original.paragraphIndent)
        XCTAssertNil(original.paragraphSpacing)
        XCTAssertEqual(original.publisherStyles, true)
        XCTAssertEqual(original.textNormalization, false)
    }

    func testNightThemeAvoidsPureBlackAndPureWhite() {
        XCTAssertNotEqual(Palette.readerBackgroundHex(for: .night), "#000000")
        XCTAssertNotEqual(Palette.readerTextHex(for: .night), "#FFFFFF")
    }

    func testProviderThinkingIsRemoved() {
        XCTAssertEqual(AIClient.stripThinking("<think>private analysis</think>final answer"), "final answer")
    }

    func testChineseWordMeaningsArePutOnSeparateLines() {
        XCTAssertEqual(
            AIClient.formatChineseWordExplanation("quality /ˈkwɒləti/ 本义：品质 此处：卓越标准"),
            "quality /ˈkwɒləti/\n本义：品质\n此处：卓越标准"
        )
    }

    func testPairingCodeNormalizationAndContentHash() {
        let displayed = "dawn_ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-23"
        XCTAssertEqual(DawnSyncClient.normalizePairingCode(displayed), "dawn_ABCDEFGHJKLMNPQRSTUVWXYZ23")
        XCTAssertNil(DawnSyncClient.normalizePairingCode("dawn_short"))
        XCTAssertEqual(
            DawnSyncClient.contentHash(for: Data("Dawn Reader".utf8)),
            "c138284e2a2577aeb3e5be792975a1f94e78b2e3274aaee11cc488eb0947e123"
        )
    }

    func testPhonePresentationUsesCompactListBottomSheetAndNoPencilControls() {
        let policy = DawnPresentationPolicy(deviceClass: .phone)

        XCTAssertEqual(policy.libraryPresentation, .compactList)
        XCTAssertEqual(policy.assistantPresentation, .bottomSheet)
        XCTAssertFalse(policy.showsPencilControls)
        XCTAssertTrue(policy.allowsFingerSelection)
        XCTAssertEqual(policy.readerTopBarHeight, 50)
        XCTAssertEqual(policy.readerBottomBarHeight, 54)
    }

    func testPadPresentationKeepsAdaptiveGridFloatingAssistantAndPencilControls() {
        let policy = DawnPresentationPolicy(deviceClass: .pad)

        XCTAssertEqual(policy.libraryPresentation, .adaptiveGrid)
        XCTAssertEqual(policy.assistantPresentation, .selectionAdjacent)
        XCTAssertTrue(policy.showsPencilControls)
        XCTAssertFalse(policy.allowsFingerSelection)
        XCTAssertEqual(policy.readerTopBarHeight, 58)
        XCTAssertEqual(policy.readerBottomBarHeight, 52)
    }

    func testTouchSelectionRoutingCapturesPhoneFingerAndPreservesPencilPath() {
        let phone = DawnPresentationPolicy(deviceClass: .phone)
        let pad = DawnPresentationPolicy(deviceClass: .pad)

        XCTAssertEqual(phone.nativeSelectionRoute(pencilSelectionInProgress: false), .captureFingerSelection)
        XCTAssertEqual(phone.nativeSelectionRoute(pencilSelectionInProgress: true), .pencilManaged)
        XCTAssertEqual(pad.nativeSelectionRoute(pencilSelectionInProgress: false), .discardFingerSelection)
        XCTAssertEqual(pad.nativeSelectionRoute(pencilSelectionInProgress: true), .pencilManaged)
    }

    func testPhoneLibraryPaddingHandlesSEAndLandscapeWidthsWithoutBecomingTabletGrid() {
        let phone = DawnPresentationPolicy(deviceClass: .phone)

        XCTAssertEqual(phone.libraryHorizontalPadding(for: 320), 12)
        XCTAssertEqual(phone.libraryHorizontalPadding(for: 390), 16)
        XCTAssertEqual(phone.libraryHorizontalPadding(for: 844), 16)
        XCTAssertEqual(phone.libraryPresentation, .compactList)
    }

    func testPhoneReaderScriptEnablesNativeLongPressSelectionInPageMode() {
        let install = ReaderContentScript.install(mode: .page, allowsFingerSelection: true)
        let update = ReaderContentScript.setMode(.page, allowsFingerSelection: true)

        XCTAssertTrue(install.contains("html[data-dawn-finger-selection=\"enabled\"] ::selection"))
        XCTAssertTrue(install.contains("dataset.dawnFingerSelection = 'enabled'"))
        XCTAssertTrue(install.contains("html[data-dawn-finger-selection=\"disabled\"][data-dawn-pencil-mode=\"page\"]"))
        XCTAssertTrue(update.contains("const allowsFingerSelection = true"))
        XCTAssertTrue(update.contains("&& !allowsFingerSelection"))
    }
}
