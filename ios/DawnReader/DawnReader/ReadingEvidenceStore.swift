import Combine
import Foundation

enum ReadingEvidenceKind: String, Codable, Sendable {
    case word
    case phrase
    case passage

    init(selectionKind: AIClient.SelectionKind) {
        switch selectionKind {
        case .word: self = .word
        case .phrase: self = .phrase
        case .passage: self = .passage
        }
    }
}

struct ReadingEvidenceExplanation: Codable, Identifiable, Equatable, Sendable {
    enum Mode: String, Codable, Sendable {
        case english
        case chinese
        case chat
    }

    let id: UUID
    let mode: Mode
    let text: String
    let question: String?
    let provider: String?
    let presentedAt: String
}

struct ReadingEvidenceRecord: Codable, Identifiable, Equatable, Sendable {
    let id: UUID
    let bookID: UUID
    let editionID: String
    let bookTitle: String
    let kind: ReadingEvidenceKind
    let selectedText: String
    let sentenceText: String
    let contextBefore: String
    let contextAfter: String
    let locatorJSON: String?
    let progression: Double?
    var explanations: [ReadingEvidenceExplanation]
    let createdAt: String
    var updatedAt: String
}

struct ReadingEvidenceDraft: Sendable {
    let id: UUID
    let bookID: UUID
    let editionID: String
    let bookTitle: String
    let kind: ReadingEvidenceKind
    let selectedText: String
    let sentenceText: String
    let contextBefore: String
    let contextAfter: String
    let locatorJSON: String?
    let progression: Double?
    let explanation: ReadingEvidenceExplanation
}

struct ReadingTimeSlice: Codable, Identifiable, Equatable, Sendable {
    let id: UUID
    let bookID: UUID
    let bookTitle: String
    let startedAt: String
    let endedAt: String
    let activeMilliseconds: Double
}

@MainActor
final class ReadingEvidenceStore: ObservableObject {
    @Published private(set) var records: [ReadingEvidenceRecord] = []
    @Published private(set) var timeSlices: [ReadingTimeSlice] = []

    private struct Envelope: Codable {
        var records: [ReadingEvidenceRecord]
        var timeSlices: [ReadingTimeSlice]
    }

    private let fileURL: URL?
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(fileURL: URL? = nil) {
        encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        decoder = JSONDecoder()
        if let fileURL {
            self.fileURL = fileURL
        } else {
            let base = try? FileManager.default.url(
                for: .applicationSupportDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: true
            )
            self.fileURL = base?.appendingPathComponent("ReadingEvidence-v1.json")
        }
        load()
    }

    func save(_ draft: ReadingEvidenceDraft) throws {
        if let index = records.firstIndex(where: { $0.id == draft.id }) {
            if !records[index].explanations.contains(where: { $0.id == draft.explanation.id }) {
                records[index].explanations.append(draft.explanation)
            }
            records[index].updatedAt = draft.explanation.presentedAt
        } else {
            records.append(ReadingEvidenceRecord(
                id: draft.id,
                bookID: draft.bookID,
                editionID: draft.editionID,
                bookTitle: draft.bookTitle,
                kind: draft.kind,
                selectedText: draft.selectedText,
                sentenceText: draft.sentenceText,
                contextBefore: draft.contextBefore,
                contextAfter: draft.contextAfter,
                locatorJSON: draft.locatorJSON,
                progression: draft.progression,
                explanations: [draft.explanation],
                createdAt: draft.explanation.presentedAt,
                updatedAt: draft.explanation.presentedAt
            ))
        }
        sortRecords()
        try persist()
    }

    func delete(_ record: ReadingEvidenceRecord) {
        records.removeAll { $0.id == record.id }
        try? persist()
    }

    func appendTimeSlice(_ slice: ReadingTimeSlice) {
        guard slice.activeMilliseconds > 0,
              !timeSlices.contains(where: { $0.id == slice.id }) else { return }
        timeSlices.append(slice)
        try? persist()
    }

    func readingTimeSummary(now: Date = Date()) -> (today: TimeInterval, week: TimeInterval) {
        let calendar = Calendar.current
        let todayStart = calendar.startOfDay(for: now)
        let weekStart = calendar.date(byAdding: .day, value: -6, to: todayStart) ?? todayStart
        var today: TimeInterval = 0
        var week: TimeInterval = 0
        for slice in timeSlices {
            guard let endedAt = Self.parseDate(slice.endedAt), endedAt <= now else { continue }
            let seconds = slice.activeMilliseconds / 1_000
            if endedAt >= weekStart { week += seconds }
            if endedAt >= todayStart { today += seconds }
        }
        return (today, week)
    }

    static func sentenceAroundSelection(before: String, selected: String, after: String, limit: Int = 520) -> String {
        let before = normalize(before)
        let selected = normalize(selected)
        let after = normalize(after)
        guard !selected.isEmpty else { return "" }
        let punctuation = CharacterSet(charactersIn: ".!?。！？")
        let beforeStart = before.unicodeScalars.lastIndex(where: { punctuation.contains($0) })
            .map { before.unicodeScalars.index(after: $0) }
        let beforeTail = beforeStart.map { String(before.unicodeScalars[$0...]) } ?? before
        let afterEnd = after.unicodeScalars.firstIndex(where: { punctuation.contains($0) })
            .map { after.unicodeScalars.index(after: $0) }
        let afterHead = afterEnd.map { String(after.unicodeScalars[..<$0]) } ?? after
        let sentence = normalize([beforeTail, selected, afterHead].filter { !$0.isEmpty }.joined(separator: " "))
        guard sentence.count > limit else { return sentence }
        return String(sentence.prefix(limit - 1)).trimmingCharacters(in: .whitespacesAndNewlines) + "…"
    }

    static func timestamp(_ date: Date = Date()) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    private static func parseDate(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    private static func normalize(_ value: String) -> String {
        value.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    }

    private func load() {
        guard let fileURL,
              let data = try? Data(contentsOf: fileURL),
              let envelope = try? decoder.decode(Envelope.self, from: data) else { return }
        records = envelope.records
        timeSlices = envelope.timeSlices
        sortRecords()
    }

    private func sortRecords() {
        records.sort { $0.updatedAt > $1.updatedAt }
    }

    private func persist() throws {
        guard let fileURL else { return }
        try FileManager.default.createDirectory(
            at: fileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        let data = try encoder.encode(Envelope(records: records, timeSlices: timeSlices))
        try data.write(to: fileURL, options: .atomic)
    }
}
