import Combine
import Foundation

enum ReaderThemeOption: String, CaseIterable, Identifiable {
    case paper
    case sepia
    case night

    var id: Self { self }

    var title: String {
        switch self {
        case .paper: "白纸"
        case .sepia: "暖纸"
        case .night: "夜间"
        }
    }
}

struct ReaderAppearance: Equatable {
    let fontSize: Double
    let lineHeight: Double
    let pageMargins: Double
    let theme: ReaderThemeOption
}

@MainActor
final class SettingsStore: ObservableObject {
    @Published var apiKey: String
    @Published var model: String
    @Published var readerFontSize: Double {
        didSet { UserDefaults.standard.set(readerFontSize, forKey: Self.fontSizeKey) }
    }
    @Published var readerLineHeight: Double {
        didSet { UserDefaults.standard.set(readerLineHeight, forKey: Self.lineHeightKey) }
    }
    @Published var readerPageMargins: Double {
        didSet { UserDefaults.standard.set(readerPageMargins, forKey: Self.pageMarginsKey) }
    }
    @Published var readerTheme: ReaderThemeOption {
        didSet { UserDefaults.standard.set(readerTheme.rawValue, forKey: Self.themeKey) }
    }

    private let modelKey = "dawn-reader.ai-model"
    private static let fontSizeKey = "dawn-reader.font-size"
    private static let lineHeightKey = "dawn-reader.line-height"
    private static let pageMarginsKey = "dawn-reader.page-margins"
    private static let themeKey = "dawn-reader.theme"

    init() {
        let defaults = UserDefaults.standard
        apiKey = KeychainStore.read("deepseek-api-key")
        model = defaults.string(forKey: modelKey) ?? "deepseek-v4-flash"
        readerFontSize = defaults.object(forKey: Self.fontSizeKey) as? Double ?? 1.0
        readerLineHeight = defaults.object(forKey: Self.lineHeightKey) as? Double ?? 1.55
        readerPageMargins = defaults.object(forKey: Self.pageMarginsKey) as? Double ?? 1.15
        readerTheme = ReaderThemeOption(rawValue: defaults.string(forKey: Self.themeKey) ?? "") ?? .paper
    }

    var readerAppearance: ReaderAppearance {
        ReaderAppearance(
            fontSize: readerFontSize,
            lineHeight: readerLineHeight,
            pageMargins: readerPageMargins,
            theme: readerTheme
        )
    }

    func save() {
        KeychainStore.write(apiKey.trimmingCharacters(in: .whitespacesAndNewlines), account: "deepseek-api-key")
        UserDefaults.standard.set(model.trimmingCharacters(in: .whitespacesAndNewlines), forKey: modelKey)
    }
}
