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
    case showFingerSelectionMenu
    case discardFingerSelection
}

struct DawnPresentationPolicy: Equatable {
    let deviceClass: DawnDeviceClass
    let compactLayout: Bool

    init(deviceClass: DawnDeviceClass, compactLayout: Bool? = nil) {
        self.deviceClass = deviceClass
        self.compactLayout = compactLayout ?? (deviceClass == .phone)
    }

    var libraryPresentation: DawnLibraryPresentation {
        compactLayout ? .compactList : .adaptiveGrid
    }

    var assistantPresentation: DawnAssistantPresentation {
        compactLayout ? .bottomSheet : .selectionAdjacent
    }

    var showsPencilControls: Bool {
        deviceClass == .pad
    }

    var allowsFingerSelection: Bool {
        deviceClass == .phone
    }

    var readerTopBarHeight: CGFloat {
        compactLayout ? 50 : 58
    }

    var readerBottomBarHeight: CGFloat {
        compactLayout ? 54 : 52
    }

    func libraryHorizontalPadding(for availableWidth: CGFloat) -> CGFloat {
        if compactLayout {
            return availableWidth <= 350 ? 12 : 16
        }
        return 34
    }

    func nativeSelectionRoute(pencilSelectionInProgress: Bool) -> DawnNativeSelectionRoute {
        if pencilSelectionInProgress {
            return .pencilManaged
        }
        return allowsFingerSelection ? .showFingerSelectionMenu : .discardFingerSelection
    }
}
