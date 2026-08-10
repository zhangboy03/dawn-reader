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
        }
    }
}
