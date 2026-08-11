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

    @Published var pencilMode: PencilMode = .select
    @Published var selectedText = ""
    @Published var selectionFrame: CGRect?
    @Published var rewriteState: RewriteState = .idle
    @Published var assistanceMode: AssistanceMode = .english
    @Published var progress = 0.0

    let title: String
    let settings: SettingsStore
    var goForward: (() -> Void)?
    var goBackward: (() -> Void)?
    var clearNativeSelection: (() -> Void)?

    private let persist: (String, Double) -> Void
    private var rewriteTask: Task<Void, Never>?
    private var selectionKey = ""
    private var selectedContext: RewriteContext?

    init(book: BookRecord, settings: SettingsStore, persist: @escaping (String, Double) -> Void) {
        title = book.title
        progress = book.progress
        self.settings = settings
        self.persist = persist
    }

    func togglePencilMode() {
        pencilMode.toggle()
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
        rewriteState = .loading
        rewriteTask?.cancel()

        let context = RewriteContext(before: text.before ?? "", highlight: highlight, after: text.after ?? "")
        selectedContext = context
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

    func clearSelection() {
        rewriteTask?.cancel()
        rewriteTask = nil
        selectionKey = ""
        selectedContext = nil
        selectedText = ""
        selectionFrame = nil
        assistanceMode = .english
        rewriteState = .idle
        clearNativeSelection?()
    }

    func updateLocation(_ locator: Locator) {
        progress = locator.locations.totalProgression ?? progress
        if let json = try? locator.jsonString() {
            persist(json, progress)
        }
    }
}
