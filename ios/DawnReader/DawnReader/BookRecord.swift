import Foundation

struct BookRecord: Codable, Identifiable, Equatable {
    let id: UUID
    var title: String
    var fileName: String
    var lastLocatorJSON: String?
    var progress: Double

    init(id: UUID = UUID(), title: String, fileName: String, lastLocatorJSON: String? = nil, progress: Double = 0) {
        self.id = id
        self.title = title
        self.fileName = fileName
        self.lastLocatorJSON = lastLocatorJSON
        self.progress = progress
    }
}
