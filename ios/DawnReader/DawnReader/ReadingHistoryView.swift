import SwiftUI

struct ReadingHistoryView: View {
    enum Filter: String, CaseIterable, Identifiable {
        case all
        case words
        case passages

        var id: Self { self }
        var title: String {
            switch self {
            case .all: "全部"
            case .words: "词语"
            case .passages: "句段"
            }
        }
    }

    @EnvironmentObject private var evidenceStore: ReadingEvidenceStore
    @Environment(\.dismiss) private var dismiss
    @State private var filter: Filter = .all
    @State private var searchText = ""
    let onOpenSource: (ReadingEvidenceRecord) -> Void

    private var visibleRecords: [ReadingEvidenceRecord] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return evidenceStore.records.filter { record in
            let kindMatches = switch filter {
            case .all: true
            case .words: record.kind == .word || record.kind == .phrase
            case .passages: record.kind == .passage
            }
            guard kindMatches else { return false }
            guard !query.isEmpty else { return true }
            let explanations = record.explanations.map(\.text).joined(separator: " ")
            return "\(record.selectedText) \(record.sentenceText) \(record.bookTitle) \(explanations)"
                .lowercased()
                .contains(query)
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    timeSummary
                    controls
                    if visibleRecords.isEmpty {
                        emptyState
                    } else {
                        ForEach(visibleRecords) { record in
                            recordView(record)
                        }
                    }
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 40)
            }
            .background(Palette.fog)
            .navigationTitle("查阅记录")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("完成") { dismiss() }
                }
            }
        }
    }

    private var timeSummary: some View {
        let summary = evidenceStore.readingTimeSummary()
        return HStack(alignment: .bottom, spacing: 26) {
            timeValue("今天", seconds: summary.today)
            timeValue("过去 7 天", seconds: summary.week)
            Spacer(minLength: 0)
        }
        .padding(.top, 26)
        .padding(.bottom, 22)
        .overlay(alignment: .bottom) { Divider().overlay(Palette.line) }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("阅读时间估算：今天 \(formatTime(summary.today))，过去七天 \(formatTime(summary.week))")
    }

    private func timeValue(_ label: String, seconds: TimeInterval) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label.uppercased())
                .font(.caption2.monospaced())
                .foregroundStyle(Palette.mutedInk)
            Text(formatTime(seconds))
                .font(.system(.title2, design: .serif).weight(.medium))
                .foregroundStyle(Palette.ink)
        }
    }

    private var controls: some View {
        VStack(spacing: 12) {
            Picker("筛选", selection: $filter) {
                ForEach(Filter.allCases) { value in Text(value.title).tag(value) }
            }
            .pickerStyle(.segmented)
            TextField("搜索原文或解释", text: $searchText)
                .textFieldStyle(.roundedBorder)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
        }
        .padding(.vertical, 18)
    }

    private func recordView(_ record: ReadingEvidenceRecord) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Text(kindLabel(record.kind))
                    .font(.caption2.monospaced().weight(.semibold))
                    .foregroundStyle(Palette.ember)
                Text(record.bookTitle)
                    .font(.caption2)
                    .foregroundStyle(Palette.mutedInk)
                    .lineLimit(1)
                Spacer()
                Text(formatDate(record.updatedAt))
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(Palette.mutedInk)
            }

            Text(record.selectedText)
                .font(.system(.title3, design: .serif).weight(.medium))
                .foregroundStyle(Palette.ink)
                .textSelection(.enabled)

            if !record.sentenceText.isEmpty, record.sentenceText != record.selectedText {
                Text(record.sentenceText)
                    .font(.system(.callout, design: .serif).italic())
                    .foregroundStyle(Palette.mutedInk)
                    .padding(.leading, 11)
                    .overlay(alignment: .leading) {
                        Rectangle().fill(Palette.ember.opacity(0.55)).frame(width: 2)
                    }
                    .textSelection(.enabled)
            }

            ForEach(record.explanations) { explanation in
                VStack(alignment: .leading, spacing: 5) {
                    Text(explanationLabel(explanation))
                        .font(.caption2.monospaced())
                        .foregroundStyle(Palette.ember)
                    Text(explanation.text)
                        .font(.system(.body, design: .serif))
                        .foregroundStyle(Palette.ink)
                        .textSelection(.enabled)
                }
            }

            HStack(spacing: 12) {
                Button("回到原文") {
                    dismiss()
                    onOpenSource(record)
                }
                .buttonStyle(.bordered)
                .disabled(record.locatorJSON == nil)

                Button("删除", role: .destructive) {
                    evidenceStore.delete(record)
                }
                .buttonStyle(.plain)
                .foregroundStyle(Palette.mutedInk)
            }
            .frame(minHeight: 44)
        }
        .padding(.vertical, 22)
        .overlay(alignment: .bottom) { Divider().overlay(Palette.line) }
        .accessibilityElement(children: .contain)
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(evidenceStore.records.isEmpty ? "还没有查阅记录" : "没有匹配的记录")
                .font(.system(.title3, design: .serif).weight(.medium))
            Text(evidenceStore.records.isEmpty
                ? "划过的词句、所在原句和完整解释会显示在这里。"
                : "换一个关键词或筛选条件试试。")
                .font(.callout)
                .foregroundStyle(Palette.mutedInk)
        }
        .padding(.vertical, 54)
    }

    private func formatTime(_ seconds: TimeInterval) -> String {
        guard seconds >= 60 else { return seconds > 0 ? "<1 分钟" : "0 分钟" }
        let minutes = Int(seconds / 60)
        if minutes < 60 { return "\(minutes) 分钟" }
        let hours = minutes / 60
        let remainder = minutes % 60
        return remainder == 0 ? "\(hours) 小时" : "\(hours) 小时 \(remainder) 分钟"
    }

    private func formatDate(_ value: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: value) else { return "" }
        return date.formatted(.dateTime.month().day().hour().minute())
    }

    private func kindLabel(_ kind: ReadingEvidenceKind) -> String {
        switch kind {
        case .word: "WORD"
        case .phrase: "PHRASE"
        case .passage: "PASSAGE"
        }
    }

    private func explanationLabel(_ explanation: ReadingEvidenceExplanation) -> String {
        switch explanation.mode {
        case .english: "英文释义"
        case .chinese: "中文详解"
        case .chat: explanation.question ?? "AI 回答"
        }
    }
}
