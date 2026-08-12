import SwiftUI

@main
struct DawnReaderApp: App {
    @StateObject private var settings = SettingsStore()
    @StateObject private var library = LibraryModel()

    var body: some Scene {
        WindowGroup {
            LibraryView()
                .environmentObject(settings)
                .environmentObject(library)
                .preferredColorScheme(.light)
                .onOpenURL { url in
                    guard url.scheme == "dawnreader", url.host == "pair",
                          let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
                          let code = components.queryItems?.first(where: { $0.name == "code" })?.value
                    else { return }
                    settings.syncCode = code
                    Task {
                        await settings.connectSync()
                        await library.synchronize(settings: settings)
                    }
                }
        }
    }
}
