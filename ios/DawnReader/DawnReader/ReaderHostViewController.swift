import ReadiumNavigator
import ReadiumShared
import UIKit
import WebKit

@MainActor
final class ReaderHostViewController: UIViewController, EPUBNavigatorDelegate, UIGestureRecognizerDelegate, UIPencilInteractionDelegate {
    private static let selectionDecorationGroup = "dawn-reader-selection"
    private static let selectionTint = UIColor(red: 0.77, green: 0.46, blue: 0.27, alpha: 1)
    private let navigator: EPUBNavigatorViewController
    private let session: ReadingSession
    private lazy var pencilGesture = UILongPressGestureRecognizer(target: self, action: #selector(handlePencilGesture(_:)))
    private lazy var fingerDismissTap = UITapGestureRecognizer(target: self, action: #selector(handleFingerDismissTap(_:)))
    private var selectionStart: CGPoint?
    private var selectionUpdateTask: Task<Void, Never>?
    private var lastSelectionUpdateTime: CFTimeInterval = 0
    private var pencilSelectionInProgress = false
    private var appliedMode: PencilMode?
    private var appliedAppearance: ReaderAppearance?

    init(publication: Publication, initialLocatorJSON: String?, session: ReadingSession) throws {
        let locator = initialLocatorJSON.flatMap { try? Locator(jsonString: $0) }
        let preferences = Self.preferences(for: session.settings.readerAppearance)
        navigator = try EPUBNavigatorViewController(
            publication: publication,
            initialLocation: locator,
            config: .init(
                preferences: preferences,
                contentInset: [
                    .compact: (top: 0, bottom: 0),
                    .regular: (top: 0, bottom: 0),
                ],
                decorationTemplates: HTMLDecorationTemplate.defaultTemplates(
                    defaultTint: Self.selectionTint,
                    cornerRadius: 2,
                    alpha: 0.34
                )
            )
        )
        self.session = session
        super.init(nibName: nil, bundle: nil)
        navigator.delegate = self
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.91, green: 0.93, blue: 0.92, alpha: 1)

        addChild(navigator)
        navigator.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(navigator.view)
        NSLayoutConstraint.activate([
            navigator.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            navigator.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            navigator.view.topAnchor.constraint(equalTo: view.topAnchor),
            navigator.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        navigator.didMove(toParent: self)

        pencilGesture.allowedTouchTypes = [NSNumber(value: UITouch.TouchType.pencil.rawValue)]
        pencilGesture.delegate = self
        pencilGesture.minimumPressDuration = 0
        pencilGesture.allowableMovement = .greatestFiniteMagnitude
        pencilGesture.numberOfTouchesRequired = 1
        pencilGesture.cancelsTouchesInView = true
        pencilGesture.delaysTouchesBegan = true
        navigator.view.addGestureRecognizer(pencilGesture)

        fingerDismissTap.allowedTouchTypes = [NSNumber(value: UITouch.TouchType.direct.rawValue)]
        fingerDismissTap.cancelsTouchesInView = false
        fingerDismissTap.delegate = self
        navigator.view.addGestureRecognizer(fingerDismissTap)

        let pencilInteraction = UIPencilInteraction()
        pencilInteraction.delegate = self
        view.addInteraction(pencilInteraction)

        session.goForward = { [weak navigator] in
            Task { await navigator?.goForward(options: .init(animated: true)) }
        }
        session.goBackward = { [weak navigator] in
            Task { await navigator?.goBackward(options: .init(animated: true)) }
        }
        session.clearNativeSelection = { [weak navigator] in
            navigator?.clearSelection()
            navigator?.apply(decorations: [], in: Self.selectionDecorationGroup)
            Task { [weak navigator] in
                _ = await navigator?.evaluateJavaScript(ReaderContentScript.clearSelection)
            }
        }
        apply(mode: session.pencilMode, appearance: session.settings.readerAppearance)
    }

    func apply(mode: PencilMode, appearance: ReaderAppearance) {
        if appliedMode != mode {
            appliedMode = mode
            selectionUpdateTask?.cancel()
            selectionStart = nil
            pencilSelectionInProgress = false
            if mode == .page {
                navigator.clearSelection()
            }
            Task { [weak navigator] in
                _ = await navigator?.evaluateJavaScript(ReaderContentScript.setMode(mode))
            }
        }
        if appliedAppearance != appearance {
            appliedAppearance = appearance
            navigator.submitPreferences(Self.preferences(for: appearance))
        }
    }

    @objc private func handlePencilGesture(_ gesture: UILongPressGestureRecognizer) {
        let location = gesture.location(in: navigator.view)
        switch gesture.state {
        case .began:
            selectionStart = location
            lastSelectionUpdateTime = 0
            session.clearSelection()
            if session.pencilMode == .select {
                pencilSelectionInProgress = true
                updatePencilSelection(from: location, to: location, final: false)
            }
        case .changed:
            if session.pencilMode == .select, let start = selectionStart {
                updatePencilSelection(from: start, to: location, final: false)
            }
        case .ended:
            guard let start = selectionStart else { return }
            selectionStart = nil
            if session.pencilMode == .page {
                let translation = CGPoint(x: location.x - start.x, y: location.y - start.y)
                guard abs(translation.x) > 56, abs(translation.x) > abs(translation.y) else { return }
                session.clearSelection()
                if translation.x < 0 {
                    session.goForward?()
                } else {
                    session.goBackward?()
                }
            } else {
                updatePencilSelection(from: start, to: location, final: true)
            }
        case .cancelled, .failed:
            selectionStart = nil
            pencilSelectionInProgress = false
            selectionUpdateTask?.cancel()
        default:
            break
        }
    }

    @objc private func handleFingerDismissTap(_ gesture: UITapGestureRecognizer) {
        guard gesture.state == .ended, session.rewriteState != .idle else { return }
        let location = gesture.location(in: navigator.view)
        let script = PencilSelectionScript.hitTest(point: location, nativeSize: navigator.view.bounds.size)
        Task { [weak self] in
            guard let self else { return }
            let result = await navigator.evaluateJavaScript(script)
            guard case let .success(value) = result else { return }
            let containsText = (value as? Bool) ?? (value as? NSNumber)?.boolValue ?? true
            if !containsText {
                session.clearSelection()
            }
        }
    }

    private func updatePencilSelection(from start: CGPoint, to end: CGPoint, final: Bool) {
        if !final {
            let now = CACurrentMediaTime()
            guard now - lastSelectionUpdateTime >= 0.035 else { return }
            lastSelectionUpdateTime = now
        }
        selectionUpdateTask?.cancel()
        let script = PencilSelectionScript.make(
            start: start,
            end: end,
            nativeSize: navigator.view.bounds.size,
            captureNative: final
        )
        selectionUpdateTask = Task { [weak self] in
            guard let self else { return }
            _ = await navigator.evaluateJavaScript(script)
            guard !Task.isCancelled, final else { return }
            try? await Task.sleep(for: .milliseconds(70))
            guard !Task.isCancelled else { return }
            pencilSelectionInProgress = false
            if let selection = navigator.currentSelection {
                session.handle(selection: selection)
                showFinalHighlight(for: selection)
                try? await Task.sleep(for: .milliseconds(90))
                guard !Task.isCancelled else { return }
                _ = await navigator.evaluateJavaScript(ReaderContentScript.clearSelection)
            }
        }
    }

    private func showFinalHighlight(for selection: Selection) {
        navigator.apply(
            decorations: [
                Decoration(
                    id: "active-selection",
                    locator: selection.locator,
                    style: .highlight(tint: Self.selectionTint, isActive: false)
                ),
            ],
            in: Self.selectionDecorationGroup
        )
    }

    private static func preferences(for appearance: ReaderAppearance) -> EPUBPreferences {
        let theme: Theme
        switch appearance.theme {
        case .paper: theme = .light
        case .sepia: theme = .sepia
        case .night: theme = .dark
        }
        return EPUBPreferences(
            columnCount: .two,
            fontFamily: .iowanOldStyle,
            fontSize: appearance.fontSize,
            hyphens: true,
            lineHeight: appearance.lineHeight,
            pageMargins: appearance.pageMargins,
            paragraphSpacing: 0.75,
            publisherStyles: false,
            scroll: false,
            spread: .always,
            textAlign: .start,
            textNormalization: true,
            theme: theme
        )
    }

    func navigator(_ navigator: EPUBNavigatorViewController, setupUserScripts userContentController: WKUserContentController) {
        userContentController.addUserScript(
            WKUserScript(
                source: ReaderContentScript.install(mode: session.pencilMode),
                injectionTime: .atDocumentEnd,
                forMainFrameOnly: false
            )
        )
    }

    func pencilInteractionDidTap(_ interaction: UIPencilInteraction) {
        session.togglePencilMode()
    }

    func navigator(_ navigator: Navigator, locationDidChange locator: Locator) {
        session.updateLocation(locator)
        Task { [weak self] in
            guard let self else { return }
            _ = await self.navigator.evaluateJavaScript(ReaderContentScript.setMode(session.pencilMode))
        }
    }

    func navigator(_ navigator: SelectableNavigator, shouldShowMenuForSelection selection: Selection) -> Bool {
        guard session.pencilMode == .select, !pencilSelectionInProgress else {
            if session.pencilMode == .page {
                navigator.clearSelection()
            }
            return false
        }
        session.handle(selection: selection)
        showFinalHighlight(for: selection)
        Task { [weak self] in
            guard let self else { return }
            try? await Task.sleep(for: .milliseconds(90))
            _ = await self.navigator.evaluateJavaScript(ReaderContentScript.clearSelection)
        }
        return false
    }

    func navigator(_ navigator: Navigator, presentError error: NavigatorError) {
        session.rewriteState = .failed("阅读器无法完成这个操作。")
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
        gestureRecognizer === fingerDismissTap || otherGestureRecognizer === fingerDismissTap
    }
}
