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

enum DawnDeviceClass: Equatable {
    case phone
    case pad
}

enum DawnLibraryPresentation: Equatable {
    case compactList
    case adaptiveGrid
}

enum DawnAssistantPresentation: Equatable {
    case bottomSheet
    case selectionAdjacent
}

enum DawnNativeSelectionRoute: Equatable {
    case pencilManaged
    case captureFingerSelection
    case discardFingerSelection
}

struct DawnPresentationPolicy: Equatable {
    let deviceClass: DawnDeviceClass

    var libraryPresentation: DawnLibraryPresentation {
        deviceClass == .phone ? .compactList : .adaptiveGrid
    }

    var assistantPresentation: DawnAssistantPresentation {
        deviceClass == .phone ? .bottomSheet : .selectionAdjacent
    }

    var showsPencilControls: Bool {
        deviceClass == .pad
    }

    var allowsFingerSelection: Bool {
        deviceClass == .phone
    }

    var readerTopBarHeight: CGFloat {
        deviceClass == .phone ? 50 : 58
    }

    var readerBottomBarHeight: CGFloat {
        deviceClass == .phone ? 54 : 52
    }

    func libraryHorizontalPadding(for availableWidth: CGFloat) -> CGFloat {
        switch deviceClass {
        case .phone:
            return availableWidth <= 350 ? 12 : 16
        case .pad:
            return 34
        }
    }

    func nativeSelectionRoute(pencilSelectionInProgress: Bool) -> DawnNativeSelectionRoute {
        if pencilSelectionInProgress {
            return .pencilManaged
        }
        return allowsFingerSelection ? .captureFingerSelection : .discardFingerSelection
    }
}
