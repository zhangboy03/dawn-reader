import Combine
import Foundation
import ReadiumNavigator
import ReadiumShared

@MainActor
final class ReadingSession: ObservableObject {
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

    @Published var pencilMode: PencilMode
    @Published var selectedText = ""
    @Published var selectionFrame: CGRect?
    @Published var rewriteState: RewriteState = .idle
    @Published var assistanceMode: AssistanceMode = .english
    @Published var progress = 0.0
    @Published var tableOfContents: [Link] = []
    @Published var currentHref = ""
    @Published var chatMessages: [ReaderChatMessage] = []
    @Published var chatSources: [ReaderChatSource] = []
    @Published var chatState: ChatState = .idle

    let title: String
    let assistantMode: BookAssistantMode
    let settings: SettingsStore
    var goForward: (() -> Void)?
    var goBackward: (() -> Void)?
    var seek: ((Double) -> Void)?
    var goToChapter: ((Link) -> Void)?
    var clearNativeSelection: (() -> Void)?

    private let persist: (String, Double) -> Void
    private var rewriteTask: Task<Void, Never>?
    private var selectionKey = ""
    private var selectedContext: RewriteContext?

    init(book: BookRecord, settings: SettingsStore, persist: @escaping (String, Double) -> Void) {
        title = book.title
        assistantMode = book.effectiveAssistantMode
        progress = book.progress
        self.settings = settings
        pencilMode = settings.pencilMode
        self.persist = persist
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
        selectedText = highlight
        selectionFrame = selection.frame
        assistanceMode = .english
        rewriteTask?.cancel()

        let context = RewriteContext(before: text.before ?? "", highlight: highlight, after: text.after ?? "")
        selectedContext = context
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
                chatState = .idle
            } catch {
                guard !Task.isCancelled else { return }
                chatState = .failed(error.localizedDescription)
            }
        }
    }

    func clearSelection() {
        rewriteTask?.cancel()
        rewriteTask = nil
        selectionKey = ""
        selectedContext = nil
        selectedText = ""
        selectionFrame = nil
        assistanceMode = .english
        rewriteState = .idle
        chatMessages = []
        chatSources = []
        chatState = .idle
        clearNativeSelection?()
    }

    func updateLocation(_ locator: Locator) {
        currentHref = locator.href.string
        progress = locator.locations.totalProgression ?? progress
        if let json = try? locator.jsonString() {
            persist(json, progress)
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
