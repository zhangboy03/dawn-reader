import Combine
import Foundation

@MainActor
final class SettingsStore: ObservableObject {
    @Published var apiKey: String
    @Published var model: String

    private let modelKey = "dawn-reader.ai-model"

    init() {
        apiKey = KeychainStore.read("deepseek-api-key")
        model = UserDefaults.standard.string(forKey: modelKey) ?? "deepseek-v4-flash"
    }

    func save() {
        KeychainStore.write(apiKey.trimmingCharacters(in: .whitespacesAndNewlines), account: "deepseek-api-key")
        UserDefaults.standard.set(model.trimmingCharacters(in: .whitespacesAndNewlines), forKey: modelKey)
    }
}
