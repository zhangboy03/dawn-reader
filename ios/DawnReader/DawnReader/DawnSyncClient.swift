import CryptoKit
import Foundation

enum DawnSyncError: LocalizedError {
    case invalidPairingCode
    case server(String)

    var errorDescription: String? {
        switch self {
        case .invalidPairingCode: "配对码无效，请在网站重新生成。"
        case let .server(message): message
        }
    }
}

struct CloudBook: Codable, Sendable {
    let id: String
    let title: String
    let fileName: String
    let fileSize: Int
    let contentHash: String?
    let addedAt: String
    let updatedAt: String
}

struct CloudDeletedBook: Codable, Sendable {
    let id: String
    let deletedAt: String
}

struct CloudReadingPosition: Codable, Sendable {
    let cfi: String?
    let nativeLocator: String?
    let percentage: Int
    let updatedAt: String
}

struct CloudReaderSettings: Codable, Sendable {
    let nativeFontScale: Double?
    let lineHeight: Double?
    let nativePageMargins: Double?
    let theme: String?
    let pencilMode: String?
    let textAlign: String?
    let paragraphStyle: String?
    let typographyMode: String?
}

private struct CloudState: Codable, Sendable {
    let settings: CloudReaderSettings?
}

struct CloudBookList: Codable, Sendable {
    let books: [CloudBook]
    let deletedBookIds: [String]?
    let deletedBooks: [CloudDeletedBook]?
}

struct ReaderChatMessage: Codable, Equatable, Sendable {
    let role: String
    let content: String
}

struct ReaderChatSource: Codable, Equatable, Sendable {
    let title: String
    let url: URL
}

struct ReaderChatResponse: Codable, Equatable, Sendable {
    let answer: String
    let sources: [ReaderChatSource]
    let searched: Bool
    let searchAvailable: Bool
}

private struct CloudProgressResponse: Codable, Sendable {
    let position: CloudReadingPosition?
}

private struct CloudErrorBody: Codable, Sendable {
    let error: String?
}

enum DawnSyncClient {
    static let serviceURL = URL(string: "https://dawn-reader-keeplearning.zhangboy.chatgpt.site")!

    static func normalizePairingCode(_ value: String) -> String? {
        let compact = value
            .components(separatedBy: CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: "-")))
            .joined()
            .uppercased()
        guard compact.hasPrefix("DAWN_"), compact.count == 31 else { return nil }
        let body = compact.dropFirst(5)
        let alphabet = CharacterSet(charactersIn: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
        guard body.unicodeScalars.allSatisfy(alphabet.contains) else { return nil }
        return "dawn_\(body)"
    }

    static func contentHash(for data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    static func verify(token: String) async throws {
        _ = try await send(path: "/api/device/session", token: token)
    }

    static func loadSettings(token: String) async throws -> CloudReaderSettings? {
        let data = try await send(path: "/api/state", token: token)
        return try JSONDecoder().decode(CloudState.self, from: data).settings
    }

    static func saveSettings(token: String, settings: CloudReaderSettings) async throws {
        let body = try JSONEncoder().encode(["settings": settings])
        _ = try await send(path: "/api/state", token: token, method: "PUT", body: body, contentType: "application/json")
    }

    static func loadLibrary(token: String) async throws -> CloudBookList {
        let data = try await send(path: "/api/books", token: token)
        return try JSONDecoder().decode(CloudBookList.self, from: data)
    }

    static func downloadBook(token: String, id: String) async throws -> Data {
        try await send(path: "/api/books/\(pathComponent(id))/file", token: token)
    }

    static func deleteBook(token: String, id: String) async throws {
        _ = try await send(path: "/api/books/\(pathComponent(id))", token: token, method: "DELETE")
    }

    static func uploadBook(
        token: String,
        id: String,
        title: String,
        fileName: String,
        addedAt: String,
        contentHash: String,
        data: Data
    ) async throws {
        let boundary = "DawnReader-\(UUID().uuidString)"
        var body = Data()
        func append(_ text: String) { body.append(Data(text.utf8)) }
        func field(_ name: String, _ value: String) {
            append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n")
        }
        field("id", id)
        field("title", title)
        field("addedAt", addedAt)
        field("contentHash", contentHash)
        let safeName = fileName.replacingOccurrences(of: "\"", with: "")
        append("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(safeName)\"\r\nContent-Type: application/epub+zip\r\n\r\n")
        body.append(data)
        append("\r\n--\(boundary)--\r\n")
        _ = try await send(
            path: "/api/books",
            token: token,
            method: "POST",
            body: body,
            contentType: "multipart/form-data; boundary=\(boundary)"
        )
    }

    static func loadProgress(token: String, bookID: String) async throws -> CloudReadingPosition? {
        let data = try await send(path: "/api/books/\(pathComponent(bookID))/progress", token: token)
        return try JSONDecoder().decode(CloudProgressResponse.self, from: data).position
    }

    static func saveProgress(
        token: String,
        bookID: String,
        locatorJSON: String,
        progress: Double,
        updatedAt: String
    ) async throws {
        struct Input: Encodable {
            let cfi: String? = nil
            let nativeLocator: String
            let percentage: Int
            let updatedAt: String
        }
        let body = try JSONEncoder().encode(Input(
            nativeLocator: locatorJSON,
            percentage: Int((progress * 100).rounded()),
            updatedAt: updatedAt
        ))
        _ = try await send(
            path: "/api/books/\(pathComponent(bookID))/progress",
            token: token,
            method: "PUT",
            body: body,
            contentType: "application/json"
        )
    }

    static func chat(
        token: String,
        context: RewriteContext,
        title: String,
        messages: [ReaderChatMessage]
    ) async throws -> ReaderChatResponse {
        struct Input: Encodable {
            struct Context: Encodable {
                let before: String
                let after: String
            }
            let text: String
            let context: Context
            let bookTitle: String
            let messages: [ReaderChatMessage]
        }
        let body = try JSONEncoder().encode(Input(
            text: String(context.highlight.prefix(2400)),
            context: .init(
                before: String(context.before.suffix(1200)),
                after: String(context.after.prefix(1200))
            ),
            bookTitle: String(title.prefix(200)),
            messages: Array(messages.suffix(10))
        ))
        let data = try await send(
            path: "/api/chat",
            token: token,
            method: "POST",
            body: body,
            contentType: "application/json"
        )
        return try JSONDecoder().decode(ReaderChatResponse.self, from: data)
    }

    private static func pathComponent(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? value
    }

    private static func send(
        path: String,
        token: String,
        method: String = "GET",
        body: Data? = nil,
        contentType: String? = nil
    ) async throws -> Data {
        guard let normalized = normalizePairingCode(token) else { throw DawnSyncError.invalidPairingCode }
        guard var components = URLComponents(url: serviceURL, resolvingAgainstBaseURL: false) else {
            throw DawnSyncError.server("同步地址无效。")
        }
        components.percentEncodedPath = path
        guard let url = components.url else { throw DawnSyncError.server("同步地址无效。") }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = body
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 45
        request.setValue("Bearer \(normalized)", forHTTPHeaderField: "Authorization")
        if let contentType { request.setValue(contentType, forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200 ... 299).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode(CloudErrorBody.self, from: data).error) ?? "同步服务暂时不可用。"
            throw DawnSyncError.server(message)
        }
        return data
    }
}
