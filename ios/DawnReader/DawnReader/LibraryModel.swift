import Combine
import Foundation
import ReadiumShared

@MainActor
final class LibraryModel: ObservableObject {
    enum SyncState: Equatable {
        case disconnected
        case syncing
        case synced
        case failed(String)
    }

    @Published private(set) var books: [BookRecord] = []
    @Published var openedBook: OpenedBook?
    @Published var errorMessage: String?
    @Published private(set) var importNotice: String?
    @Published var isWorking = false
    @Published private(set) var syncState: SyncState = .disconnected

    private let readium = ReadiumService()
    private let defaultsKey = "dawn-reader.books.v1"
    private let deletedCloudIDsKey = "dawn-reader.deleted-cloud-ids.v1"
    private let deletedContentHashesKey = "dawn-reader.deleted-content-hashes.v1"
    private var syncToken = ""
    private var progressSyncTasks: [UUID: Task<Void, Never>] = [:]

    init() {
        loadBooks()
        Task { await importBooksFromDocuments() }
    }

    func importBook(from sourceURL: URL, settings: SettingsStore) async {
        await importBooks(from: [sourceURL], settings: settings)
    }

    func importBooks(from sourceURLs: [URL], settings: SettingsStore) async {
        guard !isWorking, !sourceURLs.isEmpty else { return }
        isWorking = true
        defer { isWorking = false }
        var importedCount = 0
        var existingCount = 0
        var failedNames: [String] = []
        var singleBookToOpen: (record: BookRecord, publication: Publication)?

        for sourceURL in sourceURLs where sourceURL.pathExtension.lowercased() == "epub" {
            var copiedURL: URL?
            do {
                let granted = sourceURL.startAccessingSecurityScopedResource()
                defer { if granted { sourceURL.stopAccessingSecurityScopedResource() } }

                let data = try Data(contentsOf: sourceURL)
                let hash = DawnSyncClient.contentHash(for: data)
                var deletedHashes = deletedContentHashes()
                if deletedHashes.remove(hash) != nil {
                    saveDeletedContentHashes(deletedHashes)
                }
                if let existing = books.first(where: { $0.contentHash == hash || $0.cloudID == "sha256:\(hash)" }) {
                    existingCount += 1
                    if sourceURLs.count == 1 {
                        let publication = try await readium.open(url: try booksDirectory().appendingPathComponent(existing.fileName))
                        singleBookToOpen = (existing, publication)
                    }
                    continue
                }

                let id = UUID()
                let fileName = "\(id.uuidString).epub"
                let destination = try booksDirectory().appendingPathComponent(fileName)
                copiedURL = destination
                try FileManager.default.copyItem(at: sourceURL, to: destination)

                let publication = try await readium.open(url: destination)
                let title = publication.metadata.title?.trimmingCharacters(in: .whitespacesAndNewlines)
                    ?? sourceURL.deletingPathExtension().lastPathComponent
                let record = BookRecord(
                    id: id,
                    title: title,
                    fileName: fileName,
                    cloudID: "sha256:\(hash)",
                    contentHash: hash,
                    fileSize: data.count,
                    originalFileName: sourceURL.lastPathComponent,
                    addedAt: ISO8601DateFormatter().string(from: Date())
                )
                books.append(record)
                importedCount += 1
                if sourceURLs.count == 1 { singleBookToOpen = (record, publication) }
            } catch {
                if let copiedURL { try? FileManager.default.removeItem(at: copiedURL) }
                failedNames.append(sourceURL.lastPathComponent)
            }
        }

        sortBooksByRecency()
        saveBooks()
        if let singleBookToOpen {
            do {
                try open(singleBookToOpen.record, publication: singleBookToOpen.publication, settings: settings)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
        let summary = [
            importedCount > 0 ? "已导入 \(importedCount) 本" : nil,
            existingCount > 0 ? "\(existingCount) 本已在书架中" : nil,
            failedNames.isEmpty ? nil : "\(failedNames.count) 本导入失败"
        ].compactMap { $0 }.joined(separator: " · ")
        if !summary.isEmpty { showLibraryNotice(summary) }
        if !failedNames.isEmpty { errorMessage = "无法导入：\(failedNames.joined(separator: "、"))" }
        if importedCount > 0 { Task { await synchronize(settings: settings) } }
    }

    func open(_ record: BookRecord, settings: SettingsStore) async {
        guard !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            let publication = try await readium.open(url: try booksDirectory().appendingPathComponent(record.fileName))
            try open(record, publication: publication, settings: settings)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func openEvidence(
        _ evidence: ReadingEvidenceRecord,
        settings: SettingsStore,
        evidenceStore: ReadingEvidenceStore
    ) async {
        guard !isWorking else { return }
        guard let record = books.first(where: { $0.id == evidence.bookID }),
              let locatorJSON = evidence.locatorJSON else {
            errorMessage = "这本书当前不在书架中，暂时无法回到原文。"
            return
        }
        isWorking = true
        defer { isWorking = false }
        do {
            let publication = try await readium.open(url: try booksDirectory().appendingPathComponent(record.fileName))
            try open(
                record,
                publication: publication,
                settings: settings,
                initialLocatorJSON: locatorJSON,
                referenceReturnLocatorJSON: record.lastLocatorJSON,
                evidenceStore: evidenceStore
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func closeReader() {
        openedBook = nil
    }

    func setAssistantMode(_ mode: BookAssistantMode, for record: BookRecord) {
        guard let index = books.firstIndex(where: { $0.id == record.id }) else { return }
        books[index].assistantMode = mode
        saveBooks()
    }

    func delete(_ record: BookRecord, settings: SettingsStore) async {
        guard !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            progressSyncTasks[record.id]?.cancel()
            progressSyncTasks[record.id] = nil
            if let cloudID = record.cloudID {
                var pending = deletedCloudIDs()
                pending.insert(cloudID)
                saveDeletedCloudIDs(pending)
                if let token = DawnSyncClient.normalizePairingCode(settings.syncCode) {
                    try await DawnSyncClient.deleteBook(token: token, id: cloudID)
                }
            }
            if let contentHash = record.contentHash {
                var deletedHashes = deletedContentHashes()
                deletedHashes.insert(contentHash)
                saveDeletedContentHashes(deletedHashes)
            }
            if openedBook?.record.id == record.id { openedBook = nil }
            let fileURL = try booksDirectory().appendingPathComponent(record.fileName)
            if FileManager.default.fileExists(atPath: fileURL.path) {
                try FileManager.default.removeItem(at: fileURL)
            }
            books.removeAll { $0.id == record.id }
            saveBooks()
            showLibraryNotice("已从书架删除《\(record.title)》")
            if let cloudID = record.cloudID,
               DawnSyncClient.normalizePairingCode(settings.syncCode) != nil
            {
                var pending = deletedCloudIDs()
                pending.remove(cloudID)
                saveDeletedCloudIDs(pending)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func open(
        _ record: BookRecord,
        publication: Publication,
        settings: SettingsStore,
        initialLocatorJSON: String? = nil,
        referenceReturnLocatorJSON: String? = nil,
        evidenceStore: ReadingEvidenceStore? = nil
    ) throws {
        let requestedLocatorJSON = initialLocatorJSON ?? record.lastLocatorJSON
        let validLocatorJSON = Self.validatedLocatorJSON(requestedLocatorJSON)
        let referenceMode = initialLocatorJSON != nil && validLocatorJSON != nil
        let session = ReadingSession(book: record, settings: settings, referenceMode: referenceMode) { [weak self] locatorJSON, progress in
            self?.persistProgress(bookID: record.id, locatorJSON: locatorJSON, progress: progress)
        }
        if let evidenceStore { session.attachEvidenceStore(evidenceStore) }
        let controller = try ReaderHostViewController(
            publication: publication,
            initialLocatorJSON: validLocatorJSON,
            initialProgression: validLocatorJSON == nil ? record.progress : nil,
            referenceReturnLocatorJSON: referenceReturnLocatorJSON,
            session: session
        )
        var openedRecord = record
        if let index = books.firstIndex(where: { $0.id == record.id }) {
            books[index].lastOpenedAt = ISO8601DateFormatter().string(from: Date())
            openedRecord = books[index]
            sortBooksByRecency()
            saveBooks()
        }
        openedBook = OpenedBook(record: openedRecord, session: session, controller: controller)
    }

    private func persistProgress(bookID: UUID, locatorJSON: String, progress: Double) {
        guard let index = books.firstIndex(where: { $0.id == bookID }) else { return }
        books[index].lastLocatorJSON = locatorJSON
        books[index].progress = progress
        let updatedAt = ISO8601DateFormatter().string(from: Date())
        books[index].progressUpdatedAt = updatedAt
        saveBooks()
        guard !syncToken.isEmpty, let cloudID = books[index].cloudID else { return }
        progressSyncTasks[bookID]?.cancel()
        progressSyncTasks[bookID] = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(800))
            guard !Task.isCancelled else { return }
            try? await DawnSyncClient.saveProgress(
                token: self?.syncToken ?? "",
                bookID: cloudID,
                locatorJSON: locatorJSON,
                progress: progress,
                updatedAt: updatedAt
            )
        }
    }

    func synchronize(settings: SettingsStore) async {
        guard let token = DawnSyncClient.normalizePairingCode(settings.syncCode) else {
            syncToken = ""
            syncState = .disconnected
            return
        }
        guard syncState != .syncing else { return }
        syncToken = token
        syncState = .syncing
        do {
            try await DawnSyncClient.verify(token: token)
            if let cloudSettings = try await DawnSyncClient.loadSettings(token: token) {
                settings.apply(cloudSettings: cloudSettings)
            }
            let cloudLibrary = try await DawnSyncClient.loadLibrary(token: token)
            var remoteBooks = cloudLibrary.books
            let deletionDates = Dictionary(uniqueKeysWithValues: (cloudLibrary.deletedBooks ?? []).map { ($0.id, $0.deletedAt) })
            let staleLocalIDs = Set(books.compactMap { record -> UUID? in
                guard let cloudID = record.cloudID, let deletedAt = deletionDates[cloudID] else { return nil }
                return (record.addedAt ?? "") <= deletedAt ? record.id : nil
            })
            for record in books where staleLocalIDs.contains(record.id) {
                progressSyncTasks[record.id]?.cancel()
                let fileURL = try booksDirectory().appendingPathComponent(record.fileName)
                if FileManager.default.fileExists(atPath: fileURL.path) {
                    try FileManager.default.removeItem(at: fileURL)
                }
            }
            books.removeAll { staleLocalIDs.contains($0.id) }
            var pendingDeletions = deletedCloudIDs()
            for cloudID in Array(pendingDeletions) {
                try await DawnSyncClient.deleteBook(token: token, id: cloudID)
                remoteBooks.removeAll { $0.id == cloudID }
                pendingDeletions.remove(cloudID)
            }
            saveDeletedCloudIDs(pendingDeletions)
            var matchedRemoteIDs = Set<String>()

            for index in books.indices {
                let fileURL = try booksDirectory().appendingPathComponent(books[index].fileName)
                let data = try Data(contentsOf: fileURL)
                let hash = books[index].contentHash ?? DawnSyncClient.contentHash(for: data)
                books[index].contentHash = hash
                books[index].fileSize = data.count
                books[index].addedAt = books[index].addedAt ?? ISO8601DateFormatter().string(from: Date())
                if books[index].progressUpdatedAt == nil,
                   books[index].progress > 0 || books[index].lastLocatorJSON != nil
                {
                    books[index].progressUpdatedAt = ISO8601DateFormatter().string(from: Date())
                }

                let remote = remoteBooks.first { candidate in
                    Self.matchesRemoteBook(candidate, cloudID: books[index].cloudID, contentHash: hash)
                }
                if let remote {
                    books[index].cloudID = remote.id
                    books[index].contentHash = remote.contentHash ?? hash
                    matchedRemoteIDs.insert(remote.id)
                } else {
                    let cloudID = "sha256:\(hash)"
                    try await DawnSyncClient.uploadBook(
                        token: token,
                        id: cloudID,
                        title: books[index].title,
                        fileName: books[index].originalFileName ?? "\(books[index].title).epub",
                        addedAt: books[index].addedAt!,
                        contentHash: hash,
                        data: data
                    )
                    books[index].cloudID = cloudID
                    matchedRemoteIDs.insert(cloudID)
                    remoteBooks.append(CloudBook(
                        id: cloudID,
                        title: books[index].title,
                        fileName: books[index].originalFileName ?? "\(books[index].title).epub",
                        fileSize: data.count,
                        contentHash: hash,
                        addedAt: books[index].addedAt!,
                        updatedAt: books[index].addedAt!
                    ))
                }
                try await reconcileProgress(at: index, token: token)
            }

            for remote in remoteBooks where !matchedRemoteIDs.contains(remote.id) {
                let data = try await DawnSyncClient.downloadBook(token: token, id: remote.id)
                let localID = UUID()
                let fileName = "\(localID.uuidString).epub"
                try data.write(to: try booksDirectory().appendingPathComponent(fileName), options: .atomic)
                var record = BookRecord(
                    id: localID,
                    title: remote.title,
                    fileName: fileName,
                    cloudID: remote.id,
                    contentHash: remote.contentHash ?? DawnSyncClient.contentHash(for: data),
                    fileSize: data.count,
                    originalFileName: remote.fileName,
                    addedAt: remote.addedAt
                )
                if let progress = try await DawnSyncClient.loadProgress(token: token, bookID: remote.id) {
                    record.progress = Double(progress.percentage) / 100
                    record.lastLocatorJSON = progress.nativeLocator
                    record.progressUpdatedAt = progress.updatedAt
                }
                books.append(record)
            }
            sortBooksByRecency()
            saveBooks()
            syncState = .synced
        } catch {
            syncState = .failed(error.localizedDescription)
        }
    }

    private func reconcileProgress(at index: Int, token: String) async throws {
        guard let cloudID = books[index].cloudID else { return }
        let remote = try await DawnSyncClient.loadProgress(token: token, bookID: cloudID)
        let localUpdatedAt = books[index].progressUpdatedAt ?? ""
        if let remote, remote.updatedAt > localUpdatedAt {
            books[index].progress = Double(remote.percentage) / 100
            books[index].lastLocatorJSON = remote.nativeLocator
            books[index].progressUpdatedAt = remote.updatedAt
        } else if let locator = books[index].lastLocatorJSON,
                  let updatedAt = books[index].progressUpdatedAt
        {
            try await DawnSyncClient.saveProgress(
                token: token,
                bookID: cloudID,
                locatorJSON: locator,
                progress: books[index].progress,
                updatedAt: updatedAt
            )
        }
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
            let deletedHashes = deletedContentHashes()

            for source in sources where !books.contains(where: { $0.fileName == source.lastPathComponent }) {
                let data = try Data(contentsOf: source)
                let hash = DawnSyncClient.contentHash(for: data)
                guard Self.shouldAutoImport(contentHash: hash, deletedHashes: deletedHashes) else { continue }
                let destination = try booksDirectory().appendingPathComponent(source.lastPathComponent)
                if !FileManager.default.fileExists(atPath: destination.path) {
                    try FileManager.default.copyItem(at: source, to: destination)
                }
                let publication = try await readium.open(url: destination)
                let title = publication.metadata.title?.trimmingCharacters(in: .whitespacesAndNewlines)
                    ?? source.deletingPathExtension().lastPathComponent
                books.append(BookRecord(
                    title: title,
                    fileName: source.lastPathComponent,
                    cloudID: "sha256:\(hash)",
                    contentHash: hash,
                    fileSize: data.count,
                    originalFileName: source.lastPathComponent,
                    addedAt: ISO8601DateFormatter().string(from: Date())
                ))
            }
            sortBooksByRecency()
            saveBooks()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadBooks() {
        guard let data = UserDefaults.standard.data(forKey: defaultsKey),
              let stored = try? JSONDecoder().decode([BookRecord].self, from: data) else { return }
        books = stored
        sortBooksByRecency()
    }

    private func sortBooksByRecency() {
        books.sort { lhs, rhs in
            let lhsRecent = lhs.lastOpenedAt ?? lhs.addedAt ?? ""
            let rhsRecent = rhs.lastOpenedAt ?? rhs.addedAt ?? ""
            if lhsRecent != rhsRecent { return lhsRecent > rhsRecent }
            return (lhs.addedAt ?? "") > (rhs.addedAt ?? "")
        }
    }

    private func saveBooks() {
        guard let data = try? JSONEncoder().encode(books) else { return }
        UserDefaults.standard.set(data, forKey: defaultsKey)
    }

    private func showLibraryNotice(_ message: String) {
        importNotice = message
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(4))
            guard self?.importNotice == message else { return }
            self?.importNotice = nil
        }
    }

    private func deletedCloudIDs() -> Set<String> {
        Set(UserDefaults.standard.stringArray(forKey: deletedCloudIDsKey) ?? [])
    }

    private func saveDeletedCloudIDs(_ ids: Set<String>) {
        UserDefaults.standard.set(Array(ids).sorted(), forKey: deletedCloudIDsKey)
    }

    private func deletedContentHashes() -> Set<String> {
        Set(UserDefaults.standard.stringArray(forKey: deletedContentHashesKey) ?? [])
    }

    private func saveDeletedContentHashes(_ hashes: Set<String>) {
        UserDefaults.standard.set(Array(hashes).sorted(), forKey: deletedContentHashesKey)
    }

    static func matchesRemoteBook(_ candidate: CloudBook, cloudID: String?, contentHash: String) -> Bool {
        candidate.id == cloudID || candidate.contentHash == contentHash
    }

    static func shouldAutoImport(contentHash: String, deletedHashes: Set<String>) -> Bool {
        !deletedHashes.contains(contentHash)
    }

    static func validatedLocatorJSON(_ value: String?) -> String? {
        guard let value, (try? Locator(jsonString: value)) != nil else { return nil }
        return value
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
