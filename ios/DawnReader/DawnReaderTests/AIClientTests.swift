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

    func testSelectionScriptUsesBothCaretAPIs() {
        let script = PencilSelectionScript.make(
            start: CGPoint(x: 20, y: 30),
            end: CGPoint(x: 120, y: 34),
            nativeSize: CGSize(width: 1024, height: 700)
        )
        XCTAssertTrue(script.contains("caretPositionFromPoint"))
        XCTAssertTrue(script.contains("caretRangeFromPoint"))
        XCTAssertTrue(script.contains("wordBounds"))
        XCTAssertTrue(script.contains("\\p{L}"))
        XCTAssertTrue(script.contains("selectionchange"))
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
    }
}
