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

enum SyncConnectionState: Equatable {
    case disconnected
    case connecting
    case connected
    case failed(String)
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
    @Published var syncCode: String
    @Published private(set) var syncConnectionState: SyncConnectionState
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
    @Published var pencilMode: PencilMode {
        didSet { UserDefaults.standard.set(pencilMode.rawValue, forKey: Self.pencilModeKey) }
    }

    private let modelKey = "dawn-reader.ai-model"
    private static let fontSizeKey = "dawn-reader.font-size"
    private static let lineHeightKey = "dawn-reader.line-height"
    private static let pageMarginsKey = "dawn-reader.page-margins"
    private static let themeKey = "dawn-reader.theme"
    private static let pencilModeKey = "dawn-reader.pencil-mode"
    private static let syncCodeAccount = "dawn-reader-sync-code"

    init() {
        let defaults = UserDefaults.standard
        apiKey = KeychainStore.read("deepseek-api-key")
        let storedSyncCode = KeychainStore.read(Self.syncCodeAccount)
        syncCode = storedSyncCode
        syncConnectionState = storedSyncCode.isEmpty ? .disconnected : .connected
        model = defaults.string(forKey: modelKey) ?? "deepseek-v4-flash"
        readerFontSize = defaults.object(forKey: Self.fontSizeKey) as? Double ?? 1.0
        readerLineHeight = defaults.object(forKey: Self.lineHeightKey) as? Double ?? 1.55
        readerPageMargins = defaults.object(forKey: Self.pageMarginsKey) as? Double ?? 1.15
        readerTheme = ReaderThemeOption(rawValue: defaults.string(forKey: Self.themeKey) ?? "") ?? .paper
        pencilMode = PencilMode(rawValue: defaults.string(forKey: Self.pencilModeKey) ?? "") ?? .select
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
        if let normalized = DawnSyncClient.normalizePairingCode(syncCode) {
            syncCode = normalized
            KeychainStore.write(normalized, account: Self.syncCodeAccount)
        }
    }

    func connectSync() async {
        guard let normalized = DawnSyncClient.normalizePairingCode(syncCode) else {
            syncConnectionState = .failed("配对码格式不正确。")
            return
        }
        syncConnectionState = .connecting
        do {
            try await DawnSyncClient.verify(token: normalized)
            syncCode = normalized
            KeychainStore.write(normalized, account: Self.syncCodeAccount)
            if let cloudSettings = try await DawnSyncClient.loadSettings(token: normalized) {
                apply(cloudSettings: cloudSettings)
            }
            syncConnectionState = .connected
            NotificationCenter.default.post(name: .dawnReaderSyncRequested, object: nil)
        } catch {
            syncConnectionState = .failed(error.localizedDescription)
        }
    }

    func disconnectSync() {
        syncCode = ""
        KeychainStore.write("", account: Self.syncCodeAccount)
        syncConnectionState = .disconnected
    }

    func pushCloudSettings() async {
        guard let token = DawnSyncClient.normalizePairingCode(syncCode) else { return }
        do {
            try await DawnSyncClient.saveSettings(token: token, settings: CloudReaderSettings(
                nativeFontScale: readerFontSize,
                lineHeight: readerLineHeight,
                nativePageMargins: readerPageMargins,
                theme: readerTheme.rawValue,
                pencilMode: pencilMode.rawValue
            ))
            syncConnectionState = .connected
        } catch {
            syncConnectionState = .failed(error.localizedDescription)
        }
    }

    func apply(cloudSettings: CloudReaderSettings) {
        if let value = cloudSettings.nativeFontScale { readerFontSize = min(max(value, 0.8), 1.4) }
        if let value = cloudSettings.lineHeight { readerLineHeight = min(max(value, 1.25), 1.9) }
        if let value = cloudSettings.nativePageMargins { readerPageMargins = min(max(value, 0.7), 1.6) }
        if let value = cloudSettings.theme.flatMap(ReaderThemeOption.init(rawValue:)) { readerTheme = value }
        if let value = cloudSettings.pencilMode.flatMap(PencilMode.init(rawValue:)) { pencilMode = value }
    }
}

extension Notification.Name {
    static let dawnReaderSyncRequested = Notification.Name("dawn-reader-sync-requested")
}
