import Foundation
@preconcurrency import ReadiumNavigator
@preconcurrency import ReadiumShared
@preconcurrency import ReadiumStreamer

@MainActor
final class ReadiumService {
    private lazy var httpClient: HTTPClient = DefaultHTTPClient()
    private lazy var assetRetriever = AssetRetriever(httpClient: httpClient)
    private lazy var publicationOpener = PublicationOpener(
        parser: DefaultPublicationParser(
            httpClient: httpClient,
            assetRetriever: assetRetriever,
            pdfFactory: DefaultPDFDocumentFactory()
        )
    )

    func open(url: URL) async throws -> Publication {
        guard let fileURL = FileURL(url: url) else {
            throw ReaderError.invalidFile
        }
        let asset = try await assetRetriever.retrieve(url: fileURL).get()
        let publication = try await publicationOpener.open(
            asset: asset,
            allowUserInteraction: false,
            sender: nil
        ).get()
        guard !publication.isRestricted else {
            throw ReaderError.restrictedPublication
        }
        return publication
    }
}

enum ReaderError: LocalizedError {
    case invalidFile
    case restrictedPublication
    case unableToCreateNavigator

    var errorDescription: String? {
        switch self {
        case .invalidFile: "无法读取这个 EPUB 文件。"
        case .restrictedPublication: "这个 EPUB 受到 DRM 保护。"
        case .unableToCreateNavigator: "无法打开阅读器。"
        }
    }
}
