import Foundation

enum BookAssistantMode: String, Codable, CaseIterable, Identifiable {
    case rewrite
    case ask

    var id: Self { self }

    var title: String {
        switch self {
        case .rewrite: "英文改写"
        case .ask: "AI 提问"
        }
    }
}

struct BookRecord: Codable, Identifiable, Equatable {
    let id: UUID
    var title: String
    var fileName: String
    var lastLocatorJSON: String?
    var progress: Double
    var cloudID: String?
    var contentHash: String?
    var fileSize: Int?
    var originalFileName: String?
    var addedAt: String?
    var progressUpdatedAt: String?
    var assistantMode: BookAssistantMode?

    init(
        id: UUID = UUID(),
        title: String,
        fileName: String,
        lastLocatorJSON: String? = nil,
        progress: Double = 0,
        cloudID: String? = nil,
        contentHash: String? = nil,
        fileSize: Int? = nil,
        originalFileName: String? = nil,
        addedAt: String? = nil,
        progressUpdatedAt: String? = nil,
        assistantMode: BookAssistantMode? = .rewrite
    ) {
        self.id = id
        self.title = title
        self.fileName = fileName
        self.lastLocatorJSON = lastLocatorJSON
        self.progress = progress
        self.cloudID = cloudID
        self.contentHash = contentHash
        self.fileSize = fileSize
        self.originalFileName = originalFileName
        self.addedAt = addedAt
        self.progressUpdatedAt = progressUpdatedAt
        self.assistantMode = assistantMode
    }

    var effectiveAssistantMode: BookAssistantMode { assistantMode ?? .rewrite }
}
