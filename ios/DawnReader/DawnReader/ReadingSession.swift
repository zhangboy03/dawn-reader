import Combine
import Foundation
import ReadiumNavigator
import ReadiumShared

@MainActor
final class ReadingSession: ObservableObject {
    enum AutoSaveState: Equatable {
        case idle
        case pending
        case saved
        case failed
    }
    enum AssistanceMode: Equatable {
        case english
        case chinese
    }

    enum RewriteState: Equatable {
        case idle
        case loading
        case complete(String)
        case failed(String)
    }

    enum ChatState: Equatable {
        case idle
        case loading
        case failed(String)
    }

    enum TableOfContentsState: Equatable {
        case loading
        case loaded
        case failed(String)
    }

    @Published var pencilMode: PencilMode
    @Published var selectedText = ""
    @Published var selectionFrame: CGRect?
    @Published var rewriteState: RewriteState = .idle
    @Published var assistanceMode: AssistanceMode = .english
    @Published var progress = 0.0
    @Published var tableOfContents: [Link] = []
    @Published var tableOfContentsState: TableOfContentsState = .loading
    @Published var readerErrorMessage: String?
    @Published var currentHref = ""
    @Published var chatMessages: [ReaderChatMessage] = []
    @Published var chatSources: [ReaderChatSource] = []
    @Published var chatState: ChatState = .idle
    @Published private(set) var evidencePresentationID: UUID?
    @Published private(set) var autoSaveState: AutoSaveState = .idle
    @Published private(set) var isReferenceMode: Bool

    let title: String
    let assistantMode: BookAssistantMode
    let settings: SettingsStore
    var goForward: (() -> Void)?
    var goBackward: (() -> Void)?
    var seek: ((Double) -> Void)?
    var goToChapter: ((Link) -> Void)?
    var clearNativeSelection: (() -> Void)?
    var returnFromReference: (() -> Void)?

    private let bookID: UUID
    private let editionID: String
    private let persist: (String, Double) -> Void
    private var rewriteTask: Task<Void, Never>?
    private var selectionKey = ""
    private var selectionID = UUID()
    private var selectedContext: RewriteContext?
    private var selectedLocatorJSON: String?
    private var selectedProgress: Double?
    private var currentLocatorJSON: String?
    private var pendingEvidenceDraft: ReadingEvidenceDraft?
    private weak var evidenceStore: ReadingEvidenceStore?
    private var readingActive = false
    private var activeUntil: Date?
    private var creditedThrough: Date?
    private var activityCheckpointTask: Task<Void, Never>?
    private var seenActivityIDs = Set<UUID>()

    init(
        book: BookRecord,
        settings: SettingsStore,
        referenceMode: Bool = false,
        persist: @escaping (String, Double) -> Void
    ) {
        bookID = book.id
        editionID = book.cloudID ?? book.contentHash.map { "sha256:\($0)" } ?? book.id.uuidString
        title = book.title
        assistantMode = book.effectiveAssistantMode
        progress = book.progress
        self.settings = settings
        pencilMode = settings.pencilMode
        isReferenceMode = referenceMode
        self.persist = persist
    }

    func attachEvidenceStore(_ store: ReadingEvidenceStore) {
        evidenceStore = store
    }

    func togglePencilMode() {
        pencilMode.toggle()
        settings.pencilMode = pencilMode
        clearSelection()
    }

    func handle(selection: Selection) {
        let text = selection.locator.text
        guard let highlight = text.highlight?.trimmingCharacters(in: .whitespacesAndNewlines),
              !highlight.isEmpty else { return }
        let key = "\(selection.locator.href.string):\(highlight)"
        guard key != selectionKey else { return }
        selectionKey = key
        selectionID = UUID()
        selectedText = highlight
        selectionFrame = selection.frame
        assistanceMode = .english
        rewriteTask?.cancel()

        let context = RewriteContext(before: text.before ?? "", highlight: highlight, after: text.after ?? "")
        selectedContext = context
        selectedLocatorJSON = try? selection.locator.jsonString()
        selectedProgress = selection.locator.locations.totalProgression
        pendingEvidenceDraft = nil
        evidencePresentationID = nil
        autoSaveState = .idle
        if !isReferenceMode {
            let progressLocator = selection.locator.copy(text: { $0 = .init() })
            if let locatorJSON = try? progressLocator.jsonString() {
                persist(locatorJSON, selection.locator.locations.totalProgression ?? progress)
            }
            recordActivity(id: selectionID)
        }
        chatMessages = []
        chatSources = []
        chatState = .idle
        guard assistantMode == .rewrite else {
            rewriteState = .idle
            return
        }
        rewriteState = .loading
        let apiKey = settings.apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        let model = settings.model.trimmingCharacters(in: .whitespacesAndNewlines)
        rewriteTask = Task {
            do {
                let rewrite = try await AIClient.rewrite(context: context, title: title, apiKey: apiKey, model: model)
                guard !Task.isCancelled else { return }
                rewriteState = .complete(rewrite)
                prepareEvidence(
                    explanation: rewrite,
                    mode: .english,
                    provider: "Qwen · \(model)"
                )
            } catch {
                guard !Task.isCancelled else { return }
                rewriteState = .failed(error.localizedDescription)
            }
        }
    }

    func explainInChinese() {
        guard let context = selectedContext else { return }
        assistanceMode = .chinese
        rewriteState = .loading
        rewriteTask?.cancel()

        let apiKey = settings.apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        let model = settings.model.trimmingCharacters(in: .whitespacesAndNewlines)
        rewriteTask = Task {
            do {
                let explanation = try await AIClient.explainInChinese(
                    context: context,
                    title: title,
                    apiKey: apiKey,
                    model: model
                )
                guard !Task.isCancelled else { return }
                rewriteState = .complete(explanation)
                prepareEvidence(
                    explanation: explanation,
                    mode: .chinese,
                    provider: "Qwen · \(model)"
                )
            } catch {
                guard !Task.isCancelled else { return }
                rewriteState = .failed(error.localizedDescription)
            }
        }
    }

    func ask(_ question: String) {
        guard assistantMode == .ask,
              let context = selectedContext else { return }
        let trimmed = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, chatState != .loading else { return }
        let outgoing = chatMessages + [.init(role: "user", content: trimmed)]
        chatMessages = outgoing
        chatSources = []
        chatState = .loading
        rewriteTask?.cancel()
        recordActivity()

        let apiKey = settings.apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        let model = settings.model.trimmingCharacters(in: .whitespacesAndNewlines)
        rewriteTask = Task {
            do {
                let answer = try await AIClient.chat(
                    context: context,
                    title: title,
                    messages: outgoing,
                    apiKey: apiKey,
                    model: model
                )
                guard !Task.isCancelled else { return }
                chatMessages.append(.init(role: "assistant", content: answer))
                prepareEvidence(
                    explanation: answer,
                    mode: .chat,
                    question: trimmed,
                    provider: "Qwen · \(model)"
                )
                chatState = .idle
            } catch {
                guard !Task.isCancelled else { return }
                chatState = .failed(error.localizedDescription)
            }
        }
    }

    private func prepareEvidence(
        explanation: String,
        mode: ReadingEvidenceExplanation.Mode,
        question: String? = nil,
        provider: String? = nil
    ) {
        guard let context = selectedContext else { return }
        let presentedAt = ReadingEvidenceStore.timestamp()
        let explanationRecord = ReadingEvidenceExplanation(
            id: UUID(),
            mode: mode,
            text: explanation,
            question: question,
            provider: provider,
            presentedAt: presentedAt
        )
        pendingEvidenceDraft = ReadingEvidenceDraft(
            id: selectionID,
            bookID: bookID,
            editionID: editionID,
            bookTitle: title,
            kind: ReadingEvidenceKind(selectionKind: AIClient.selectionKind(context.highlight)),
            selectedText: context.highlight,
            sentenceText: ReadingEvidenceStore.sentenceAroundSelection(
                before: context.before,
                selected: context.highlight,
                after: context.after
            ),
            contextBefore: context.before,
            contextAfter: context.after,
            locatorJSON: selectedLocatorJSON,
            progression: selectedProgress,
            explanation: explanationRecord
        )
        autoSaveState = .pending
        evidencePresentationID = explanationRecord.id
    }

    func confirmPresentedEvidence(_ presentationID: UUID) {
        guard evidencePresentationID == presentationID,
              let draft = pendingEvidenceDraft else { return }
        do {
            try evidenceStore?.save(draft)
            autoSaveState = .saved
            pendingEvidenceDraft = nil
            evidencePresentationID = nil
        } catch {
            autoSaveState = .failed
        }
    }

    func setReadingActive(_ active: Bool) {
        guard readingActive != active else { return }
        if !active { flushReadingTime() }
        readingActive = active && !isReferenceMode
        if !readingActive {
            activeUntil = nil
            creditedThrough = nil
        }
    }

    func recordActivity(id: UUID = UUID()) {
        guard readingActive, !isReferenceMode, !seenActivityIDs.contains(id) else { return }
        seenActivityIDs.insert(id)
        flushReadingTime()
        let now = Date()
        if activeUntil == nil || now > activeUntil! || creditedThrough == nil {
            creditedThrough = now
        }
        activeUntil = now.addingTimeInterval(60)
        ensureActivityCheckpoint()
    }

    func closeReadingSession() {
        clearSelection()
        flushReadingTime()
        activityCheckpointTask?.cancel()
        activityCheckpointTask = nil
        readingActive = false
    }

    private func ensureActivityCheckpoint() {
        guard activityCheckpointTask == nil else { return }
        activityCheckpointTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(15))
                guard let self, !Task.isCancelled else { return }
                self.flushReadingTime()
                if self.activeUntil.map({ Date() >= $0 }) == true {
                    self.activityCheckpointTask = nil
                    return
                }
            }
        }
    }

    private func flushReadingTime() {
        guard readingActive,
              let activeUntil,
              let creditedThrough else { return }
        let now = Date()
        let end = min(now, activeUntil)
        let milliseconds = max(0, end.timeIntervalSince(creditedThrough) * 1_000)
        guard milliseconds > 0 else { return }
        self.creditedThrough = end
        evidenceStore?.appendTimeSlice(ReadingTimeSlice(
            id: UUID(),
            bookID: bookID,
            bookTitle: title,
            startedAt: ReadingEvidenceStore.timestamp(end.addingTimeInterval(-milliseconds / 1_000)),
            endedAt: ReadingEvidenceStore.timestamp(end),
            activeMilliseconds: milliseconds
        ))
    }

    func continueFromReference() {
        guard isReferenceMode else { return }
        isReferenceMode = false
        readingActive = true
        if let currentLocatorJSON {
            persist(currentLocatorJSON, progress)
        }
        recordActivity()
    }

    func completeReferenceReturn() {
        isReferenceMode = false
        readingActive = true
    }

    func clearSelection() {
        rewriteTask?.cancel()
        rewriteTask = nil
        selectionKey = ""
        selectedContext = nil
        selectedLocatorJSON = nil
        selectedProgress = nil
        pendingEvidenceDraft = nil
        evidencePresentationID = nil
        selectedText = ""
        selectionFrame = nil
        assistanceMode = .english
        rewriteState = .idle
        chatMessages = []
        chatSources = []
        chatState = .idle
        autoSaveState = .idle
        clearNativeSelection?()
    }

    func updateLocation(_ locator: Locator) {
        currentHref = locator.href.string
        progress = locator.locations.totalProgression ?? progress
        if let json = try? locator.jsonString() {
            currentLocatorJSON = json
            if !isReferenceMode {
                persist(json, progress)
            }
        }
    }

    func isCurrentChapter(_ link: Link) -> Bool {
        Self.hrefKey(link.href) == Self.hrefKey(currentHref)
    }

    private static func hrefKey(_ href: String) -> String {
        let path = href
            .split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false)[0]
            .split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)[0]
        var value = String(path).removingPercentEncoding ?? String(path)
        while value.hasPrefix("../") || value.hasPrefix("./") {
            value.removeFirst(value.hasPrefix("../") ? 3 : 2)
        }
        return value
    }
}
