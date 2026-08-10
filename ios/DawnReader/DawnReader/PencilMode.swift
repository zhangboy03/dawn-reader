import Foundation

enum PencilMode: String, CaseIterable, Codable, Identifiable {
    case page
    case select

    var id: Self { self }

    var title: String {
        switch self {
        case .page: "翻页"
        case .select: "画词"
        }
    }

    mutating func toggle() {
        self = self == .page ? .select : .page
    }
}
