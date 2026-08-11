import XCTest
@testable import DawnReader

final class AIClientTests: XCTestCase {
    func testPromptKeepsSelectionSeparateFromContext() throws {
        let body = AIClient.makeBody(
            context: .init(before: "before", highlight: "selected sentence", after: "after"),
            title: "Book",
            model: "deepseek-v4-flash"
        )
        XCTAssertEqual(body.model, "deepseek-v4-flash")
        XCTAssertEqual(body.stream, false)
        XCTAssertTrue(body.messages[1].content.contains("<selection>\nselected sentence\n</selection>"))
        XCTAssertTrue(body.messages[1].content.contains("<context_before>\nbefore\n</context_before>"))
    }

    func testSingleWordPromptOnlyExplainsContextualMeaning() {
        let body = AIClient.makeBody(
            context: .init(before: "the pursuit of", highlight: "quality", after: "in work"),
            title: "Book",
            model: "deepseek-v4-flash"
        )
        XCTAssertEqual(body.maxTokens, 48)
        XCTAssertTrue(body.messages[0].content.contains("Explain only the word"))
        XCTAssertTrue(body.messages[0].content.contains("Never rewrite, summarize, or quote the surrounding"))
        XCTAssertTrue(AIClient.isSingleWord("self-reliance"))
        XCTAssertFalse(AIClient.isSingleWord("a difficult phrase"))
    }

    func testPassagePromptStillRewritesOnlySelection() {
        let body = AIClient.makeBody(
            context: .init(before: "before", highlight: "a difficult phrase", after: "after"),
            title: "Book",
            model: "deepseek-v4-flash"
        )
        XCTAssertEqual(body.maxTokens, 96)
        XCTAssertTrue(body.messages[0].content.contains("Rewrite only the text inside <selection>"))
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

        let hitTest = PencilSelectionScript.hitTest(
            point: CGPoint(x: 30, y: 40),
            nativeSize: CGSize(width: 1024, height: 700)
        )
        XCTAssertTrue(hitTest.contains("getClientRects"))
        XCTAssertTrue(hitTest.contains("return false"))
    }

    func testReaderContentScriptNormalizesKnownBrokenGlyphsAndControlsSelectionMode() {
        let install = ReaderContentScript.install(mode: .page)
        XCTAssertTrue(install.contains("\\u0085"))
        XCTAssertTrue(install.contains("Ph\\u0107drus"))
        XCTAssertTrue(install.contains("data-dawn-pencil-mode"))
        XCTAssertTrue(install.contains("user-select: none"))

        let selectMode = ReaderContentScript.setMode(.select)
        XCTAssertTrue(selectMode.contains("'select'"))
        let pageMode = ReaderContentScript.setMode(.page)
        XCTAssertTrue(pageMode.contains("removeAllRanges"))
        XCTAssertTrue(ReaderContentScript.install(mode: .select).contains("::highlight(dawn-reader-selection)"))
        XCTAssertTrue(ReaderContentScript.freezeSelection.contains("CSS.highlights.set"))
        XCTAssertTrue(ReaderContentScript.clearSelection.contains("highlights?.delete"))
    }
}
