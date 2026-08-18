import Foundation
import Testing
@testable import DawnReader

@MainActor
struct ReadingEvidenceStoreTests {
    @Test func savesOneLookupWithMultiplePresentedExplanations() throws {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("reading-evidence-\(UUID().uuidString).json")
        let store = ReadingEvidenceStore(fileURL: url)
        let bookID = UUID()
        let recordID = UUID()
        let first = ReadingEvidenceExplanation(
            id: UUID(),
            mode: .english,
            text: "fragile /ˈfrædʒaɪl/ — easily damaged",
            question: nil,
            provider: "Qwen",
            presentedAt: "2026-08-18T08:00:00.000Z"
        )
        let base = ReadingEvidenceDraft(
            id: recordID,
            bookID: bookID,
            editionID: "sha256:test",
            bookTitle: "Antifragile",
            kind: .word,
            selectedText: "fragile",
            sentenceText: "A fragile object dislikes volatility.",
            contextBefore: "A",
            contextAfter: "object dislikes volatility.",
            locatorJSON: "{}",
            progression: 0.12,
            explanation: first
        )
        try store.save(base)
        try store.save(ReadingEvidenceDraft(
            id: recordID,
            bookID: bookID,
            editionID: "sha256:test",
            bookTitle: "Antifragile",
            kind: .word,
            selectedText: "fragile",
            sentenceText: "A fragile object dislikes volatility.",
            contextBefore: "A",
            contextAfter: "object dislikes volatility.",
            locatorJSON: "{}",
            progression: 0.12,
            explanation: ReadingEvidenceExplanation(
                id: UUID(),
                mode: .chinese,
                text: "本义：脆弱的\n此处：无法从波动中获益",
                question: nil,
                provider: "Qwen",
                presentedAt: "2026-08-18T08:01:00.000Z"
            )
        ))

        #expect(store.records.count == 1)
        #expect(store.records[0].explanations.count == 2)
        try? FileManager.default.removeItem(at: url)
    }

    @Test func extractsTheContainingSentence() {
        let sentence = ReadingEvidenceStore.sentenceAroundSelection(
            before: "An earlier sentence. The market can remain",
            selected: "irrational",
            after: "longer than you can remain solvent. A later sentence."
        )
        #expect(sentence == "The market can remain irrational longer than you can remain solvent.")
    }
}
