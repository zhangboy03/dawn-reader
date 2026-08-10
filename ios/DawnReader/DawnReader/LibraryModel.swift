import Combine
import Foundation
import ReadiumShared

@MainActor
final class LibraryModel: ObservableObject {
    @Published private(set) var books: [BookRecord] = []
    @Published var openedBook: OpenedBook?
    @Published var errorMessage: String?
    @Published var isWorking = false

    private let readium = ReadiumService()
    private let defaultsKey = "dawn-reader.books.v1"

    init() {
        loadBooks()
        Task { await importBooksFromDocuments() }
    }

    func importBook(from sourceURL: URL, settings: SettingsStore) async {
        isWorking = true
        defer { isWorking = false }
        do {
            let granted = sourceURL.startAccessingSecurityScopedResource()
            defer { if granted { sourceURL.stopAccessingSecurityScopedResource() } }

            let id = UUID()
            let fileName = "\(id.uuidString).epub"
            let destination = try booksDirectory().appendingPathComponent(fileName)
            try FileManager.default.copyItem(at: sourceURL, to: destination)

            let publication = try await readium.open(url: destination)
            let title = publication.metadata.title?.trimmingCharacters(in: .whitespacesAndNewlines)
                ?? sourceURL.deletingPathExtension().lastPathComponent
            let record = BookRecord(id: id, title: title, fileName: fileName)
            books.append(record)
            saveBooks()
            try open(record, publication: publication, settings: settings)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func open(_ record: BookRecord, settings: SettingsStore) async {
        isWorking = true
        defer { isWorking = false }
        do {
            let publication = try await readium.open(url: try booksDirectory().appendingPathComponent(record.fileName))
            try open(record, publication: publication, settings: settings)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func closeReader() {
        openedBook = nil
    }

    private func open(_ record: BookRecord, publication: Publication, settings: SettingsStore) throws {
        let session = ReadingSession(book: record, settings: settings) { [weak self] locatorJSON, progress in
            self?.persistProgress(bookID: record.id, locatorJSON: locatorJSON, progress: progress)
        }
        let controller = try ReaderHostViewController(
            publication: publication,
            initialLocatorJSON: record.lastLocatorJSON,
            session: session
        )
        openedBook = OpenedBook(record: record, session: session, controller: controller)
    }

    private func persistProgress(bookID: UUID, locatorJSON: String, progress: Double) {
        guard let index = books.firstIndex(where: { $0.id == bookID }) else { return }
        books[index].lastLocatorJSON = locatorJSON
        books[index].progress = progress
        saveBooks()
    }

    private func booksDirectory() throws -> URL {
        let base = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let directory = base.appendingPathComponent("Books", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }

    private func importBooksFromDocuments() async {
        do {
            let documents = try FileManager.default.url(
                for: .documentDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: true
            )
            let sources = try FileManager.default.contentsOfDirectory(
                at: documents,
                includingPropertiesForKeys: nil
            ).filter { $0.pathExtension.lowercased() == "epub" }

            for source in sources where !books.contains(where: { $0.fileName == source.lastPathComponent }) {
                let destination = try booksDirectory().appendingPathComponent(source.lastPathComponent)
                if !FileManager.default.fileExists(atPath: destination.path) {
                    try FileManager.default.copyItem(at: source, to: destination)
                }
                let publication = try await readium.open(url: destination)
                let title = publication.metadata.title?.trimmingCharacters(in: .whitespacesAndNewlines)
                    ?? source.deletingPathExtension().lastPathComponent
                books.append(BookRecord(title: title, fileName: source.lastPathComponent))
            }
            saveBooks()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadBooks() {
        guard let data = UserDefaults.standard.data(forKey: defaultsKey),
              let stored = try? JSONDecoder().decode([BookRecord].self, from: data) else { return }
        books = stored
    }

    private func saveBooks() {
        guard let data = try? JSONEncoder().encode(books) else { return }
        UserDefaults.standard.set(data, forKey: defaultsKey)
    }
}

@MainActor
final class OpenedBook: Identifiable {
    let id: UUID
    let record: BookRecord
    let session: ReadingSession
    let controller: ReaderHostViewController

    init(record: BookRecord, session: ReadingSession, controller: ReaderHostViewController) {
        id = record.id
        self.record = record
        self.session = session
        self.controller = controller
    }
}
