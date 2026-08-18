@preconcurrency import ReadiumNavigator
@preconcurrency import ReadiumShared
import UIKit
import WebKit

@MainActor
final class ReaderHostViewController: UIViewController, EPUBNavigatorDelegate, UIGestureRecognizerDelegate, UIPencilInteractionDelegate {
    private static let selectionDecorationGroup = "dawn-reader-selection"
    private static let selectionTint = UIColor(red: 0.77, green: 0.46, blue: 0.27, alpha: 1)
    private let publication: Publication
    private let navigator: EPUBNavigatorViewController
    private let session: ReadingSession
    private let initialProgression: Double?
    private let referenceReturnLocatorJSON: String?
    private lazy var pencilGesture = UILongPressGestureRecognizer(target: self, action: #selector(handlePencilGesture(_:)))
    private lazy var fingerDismissTap = UITapGestureRecognizer(target: self, action: #selector(handleFingerDismissTap(_:)))
    private var gestureStart: CGPoint?
    private var selectionStart: CGPoint?
    private weak var selectionWebView: WKWebView?
    private var selectionUpdateTask: Task<Void, Never>?
    private var selectionUpdateID = 0
    private var lastSelectionUpdateTime: CFTimeInterval = 0
    private var pencilSelectionInProgress = false
    private var appliedMode: PencilMode?
    private var appliedAppearance: ReaderAppearance?

    private var deviceClass: DawnDeviceClass {
        UIDevice.current.userInterfaceIdiom == .phone ? .phone : .pad
    }

    private var presentation: DawnPresentationPolicy {
        DawnPresentationPolicy(deviceClass: deviceClass)
    }

    init(
        publication: Publication,
        initialLocatorJSON: String?,
        initialProgression: Double? = nil,
        referenceReturnLocatorJSON: String? = nil,
        session: ReadingSession
    ) throws {
        let locator = initialLocatorJSON.flatMap { try? Locator(jsonString: $0) }
        let preferences = Self.preferences(
            for: session.settings.readerAppearance,
            language: publication.metadata.language
        )
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
        self.publication = publication
        self.session = session
        self.initialProgression = initialProgression
        self.referenceReturnLocatorJSON = referenceReturnLocatorJSON
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

        if presentation.showsPencilControls {
            pencilGesture.allowedTouchTypes = [NSNumber(value: UITouch.TouchType.pencil.rawValue)]
            pencilGesture.delegate = self
            pencilGesture.minimumPressDuration = 0
            pencilGesture.allowableMovement = .greatestFiniteMagnitude
            pencilGesture.numberOfTouchesRequired = 1
            pencilGesture.cancelsTouchesInView = true
            pencilGesture.delaysTouchesBegan = true
            navigator.view.addGestureRecognizer(pencilGesture)

            let pencilInteraction = UIPencilInteraction()
            pencilInteraction.delegate = self
            view.addInteraction(pencilInteraction)
        }

        fingerDismissTap.allowedTouchTypes = [NSNumber(value: UITouch.TouchType.direct.rawValue)]
        fingerDismissTap.cancelsTouchesInView = false
        fingerDismissTap.delegate = self
        navigator.view.addGestureRecognizer(fingerDismissTap)

        session.goForward = { [weak navigator, weak session] in
            session?.recordActivity()
            Task { await navigator?.goForward(options: .init(animated: true)) }
        }
        session.goBackward = { [weak navigator, weak session] in
            session?.recordActivity()
            Task { await navigator?.goBackward(options: .init(animated: true)) }
        }
        session.seek = { [weak self] progression in
            guard let self else { return }
            self.session.clearSelection()
            self.session.recordActivity()
            Task {
                guard let locator = await self.publication.locate(progression: progression) else { return }
                _ = await self.navigator.go(to: locator, options: .init(animated: false))
            }
        }
        Task { [weak session, publication] in
            guard case let .success(links) = await publication.tableOfContents() else { return }
            session?.tableOfContents = links
        }
        session.goToChapter = { [weak self] link in
            guard let self else { return }
            self.session.clearSelection()
            self.session.recordActivity()
            Task {
                _ = await self.navigator.go(to: link, options: .init(animated: false))
            }
        }
        session.clearNativeSelection = { [weak self] in
            guard let self else { return }
            selectionUpdateID += 1
            selectionUpdateTask?.cancel()
            navigator.clearSelection()
            navigator.apply(decorations: [], in: Self.selectionDecorationGroup)
            Task { [weak self] in
                guard let self else { return }
                _ = await navigator.evaluateJavaScript(ReaderContentScript.clearSelection)
            }
        }
        if let referenceReturnLocatorJSON = self.referenceReturnLocatorJSON,
           let returnLocator = try? Locator(jsonString: referenceReturnLocatorJSON)
        {
            session.returnFromReference = { [weak navigator, weak session] in
                Task {
                    _ = await navigator?.go(to: returnLocator, options: .init(animated: false))
                    session?.completeReferenceReturn()
                }
            }
        }
        if let initialProgression, initialProgression > 0 {
            Task { [weak self] in
                guard let self,
                      let locator = await self.publication.locate(progression: initialProgression)
                else { return }
                _ = await self.navigator.go(to: locator, options: .init(animated: false))
            }
        }
        apply(mode: session.pencilMode, appearance: session.settings.readerAppearance)
    }

    func apply(mode: PencilMode, appearance: ReaderAppearance) {
        if appliedMode != mode {
            appliedMode = mode
            selectionUpdateTask?.cancel()
            selectionUpdateID += 1
            gestureStart = nil
            selectionStart = nil
            selectionWebView = nil
            pencilSelectionInProgress = false
            if mode == .page, !presentation.allowsFingerSelection {
                navigator.clearSelection()
            }
            Task { [weak navigator] in
                _ = await navigator?.evaluateJavaScript(
                    ReaderContentScript.setMode(
                        mode,
                        allowsFingerSelection: self.presentation.allowsFingerSelection
                    )
                )
            }
        }
        if appliedAppearance != appearance {
            appliedAppearance = appearance
            view.backgroundColor = ReadiumNavigator.Color(
                hex: Palette.readerBackgroundHex(for: appearance.theme)
            )?.uiColor
            navigator.submitPreferences(Self.preferences(for: appearance, language: publication.metadata.language))
            Task { [weak navigator] in
                _ = await navigator?.evaluateJavaScript(
                    ReaderContentScript.setTypography(
                        appearance: appearance,
                        isEnglish: Self.isEnglish(publication.metadata.language)
                    )
                )
            }
        }
    }

    @objc private func handlePencilGesture(_ gesture: UILongPressGestureRecognizer) {
        let navigatorLocation = gesture.location(in: navigator.view)
        switch gesture.state {
        case .began:
            gestureStart = navigatorLocation
            selectionStart = nil
            selectionWebView = nil
            lastSelectionUpdateTime = 0
            session.clearSelection()
            if session.pencilMode == .select,
               let coordinates = contentCoordinates(at: navigatorLocation)
            {
                pencilSelectionInProgress = true
                selectionStart = coordinates.point
                selectionWebView = coordinates.webView
                updatePencilSelection(
                    from: coordinates.point,
                    to: coordinates.point,
                    nativeSize: coordinates.webView.bounds.size,
                    final: false
                )
            }
        case .changed:
            if session.pencilMode == .select,
               let start = selectionStart,
               let webView = selectionWebView
            {
                let end = gesture.location(in: webView)
                updatePencilSelection(from: start, to: end, nativeSize: webView.bounds.size, final: false)
            }
        case .ended:
            defer {
                gestureStart = nil
                selectionStart = nil
                selectionWebView = nil
            }
            if session.pencilMode == .page {
                guard let start = gestureStart else { return }
                let translation = CGPoint(x: navigatorLocation.x - start.x, y: navigatorLocation.y - start.y)
                guard abs(translation.x) > 56, abs(translation.x) > abs(translation.y) else { return }
                session.clearSelection()
                if translation.x < 0 {
                    session.goForward?()
                } else {
                    session.goBackward?()
                }
            } else if let start = selectionStart, let webView = selectionWebView {
                let end = gesture.location(in: webView)
                updatePencilSelection(from: start, to: end, nativeSize: webView.bounds.size, final: true)
            }
        case .cancelled, .failed:
            gestureStart = nil
            selectionStart = nil
            selectionWebView = nil
            pencilSelectionInProgress = false
            selectionUpdateTask?.cancel()
            selectionUpdateID += 1
        default:
            break
        }
    }

    @objc private func handleFingerDismissTap(_ gesture: UITapGestureRecognizer) {
        guard gesture.state == .ended, !session.selectedText.isEmpty else { return }
        let location = gesture.location(in: navigator.view)
        guard let coordinates = contentCoordinates(at: location) else {
            session.clearSelection()
            return
        }
        let script = PencilSelectionScript.hitTest(
            point: coordinates.point,
            nativeSize: coordinates.webView.bounds.size
        )
        Task { [weak self] in
            guard let self else { return }
            let result = await navigator.evaluateJavaScript(script)
            guard case let .success(value) = result else {
                session.clearSelection()
                return
            }
            let containsText = (value as? Bool) ?? (value as? NSNumber)?.boolValue ?? false
            if !containsText {
                session.clearSelection()
            }
        }
    }

    private func updatePencilSelection(from start: CGPoint, to end: CGPoint, nativeSize: CGSize, final: Bool) {
        if !final {
            let now = CACurrentMediaTime()
            guard now - lastSelectionUpdateTime >= 0.035 else { return }
            lastSelectionUpdateTime = now
        }
        selectionUpdateTask?.cancel()
        selectionUpdateID += 1
        let updateID = selectionUpdateID
        let script = PencilSelectionScript.make(
            start: start,
            end: end,
            nativeSize: nativeSize,
            captureNative: final
        )
        selectionUpdateTask = Task { [weak self] in
            guard let self else { return }
            guard updateID == selectionUpdateID else { return }
            _ = await navigator.evaluateJavaScript(script)
            guard !Task.isCancelled, updateID == selectionUpdateID, final else { return }
            defer { pencilSelectionInProgress = false }
            try? await Task.sleep(for: .milliseconds(70))
            guard !Task.isCancelled, updateID == selectionUpdateID else { return }
            if let selection = navigator.currentSelection {
                session.handle(selection: selection)
                showFinalHighlight(for: selection)
                try? await Task.sleep(for: .milliseconds(90))
                guard !Task.isCancelled, updateID == selectionUpdateID else { return }
                _ = await navigator.evaluateJavaScript(ReaderContentScript.clearSelection)
            }
        }
    }

    private func captureFingerSelection(_ selection: Selection) {
        selectionUpdateTask?.cancel()
        selectionUpdateID += 1
        let updateID = selectionUpdateID

        session.handle(selection: selection)
        showFinalHighlight(for: selection)

        selectionUpdateTask = Task { [weak self] in
            guard let self else { return }
            try? await Task.sleep(for: .milliseconds(120))
            guard !Task.isCancelled, updateID == selectionUpdateID else { return }
            navigator.clearSelection()
            _ = await navigator.evaluateJavaScript(ReaderContentScript.clearSelection)
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

    static func isEnglish(_ language: Language?) -> Bool {
        guard let code = language?.code.bcp47.lowercased() else { return false }
        return code == "en" || code.hasPrefix("en-")
    }

    static func preferences(for appearance: ReaderAppearance, language: Language?) -> EPUBPreferences {
        let theme: Theme
        switch appearance.theme {
        case .paper: theme = .light
        case .sepia: theme = .sepia
        case .night: theme = .dark
        }
        let standard = appearance.typographyMode == .dawn
        let english = standard && isEnglish(language)
        let textAlign: TextAlignment? = standard
            ? (english && appearance.textAlign == .justify ? .justify : .start)
            : nil
        let paragraphIndent: Double? = standard
            ? (english && appearance.paragraphStyle == .book ? 1.25 : 0)
            : nil
        let paragraphSpacing: Double? = standard
            ? (english && appearance.paragraphStyle == .book ? 0 : 0.75)
            : nil
        return EPUBPreferences(
            backgroundColor: ReadiumNavigator.Color(hex: Palette.readerBackgroundHex(for: appearance.theme)),
            columnCount: .auto,
            fontFamily: standard ? .iowanOldStyle : nil,
            fontSize: appearance.fontSize,
            hyphens: standard ? (english && appearance.textAlign == .justify) : nil,
            lineHeight: appearance.lineHeight,
            pageMargins: appearance.pageMargins,
            paragraphIndent: paragraphIndent,
            paragraphSpacing: paragraphSpacing,
            publisherStyles: !standard,
            scroll: false,
            spread: .auto,
            textAlign: textAlign,
            textColor: ReadiumNavigator.Color(hex: Palette.readerTextHex(for: appearance.theme)),
            textNormalization: standard,
            theme: theme
        )
    }

    private func contentCoordinates(at point: CGPoint) -> (point: CGPoint, webView: WKWebView)? {
        for webView in visibleWebViews(in: navigator.view) {
            let converted = navigator.view.convert(point, to: webView)
            if webView.bounds.insetBy(dx: -1, dy: -1).contains(converted) {
                return (converted, webView)
            }
        }
        return nil
    }

    private func visibleWebViews(in view: UIView) -> [WKWebView] {
        var result: [WKWebView] = []
        if let webView = view as? WKWebView,
           !webView.isHidden,
           webView.alpha > 0.01,
           webView.window != nil
        {
            result.append(webView)
        }
        for subview in view.subviews.reversed() {
            result.append(contentsOf: visibleWebViews(in: subview))
        }
        return result
    }

    func navigator(_ navigator: EPUBNavigatorViewController, setupUserScripts userContentController: WKUserContentController) {
        userContentController.addUserScript(
            WKUserScript(
                source: ReaderContentScript.install(
                    mode: session.pencilMode,
                    appearance: session.settings.readerAppearance,
                    isEnglish: Self.isEnglish(publication.metadata.language),
                    allowsFingerSelection: presentation.allowsFingerSelection
                ),
                injectionTime: .atDocumentEnd,
                forMainFrameOnly: false
            )
        )
    }

    func pencilInteractionDidTap(_ interaction: UIPencilInteraction) {
        guard presentation.showsPencilControls else { return }
        session.togglePencilMode()
    }

    func navigator(_ navigator: Navigator, locationDidChange locator: Locator) {
        if !session.selectedText.isEmpty {
            session.clearSelection()
        }
        session.updateLocation(locator)
        session.recordActivity()
        Task { [weak self] in
            guard let self else { return }
            _ = await self.navigator.evaluateJavaScript(
                ReaderContentScript.setMode(
                    session.pencilMode,
                    allowsFingerSelection: presentation.allowsFingerSelection
                )
            )
        }
    }

    func navigator(_ navigator: SelectableNavigator, shouldShowMenuForSelection selection: Selection) -> Bool {
        switch presentation.nativeSelectionRoute(pencilSelectionInProgress: pencilSelectionInProgress) {
        case .pencilManaged:
            return false
        case .captureFingerSelection:
            captureFingerSelection(selection)
            return false
        case .discardFingerSelection:
            navigator.clearSelection()
            return false
        }
    }

    func navigator(_ navigator: Navigator, presentError error: NavigatorError) {
        session.rewriteState = .failed("阅读器无法完成这个操作。")
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
        gestureRecognizer === fingerDismissTap || otherGestureRecognizer === fingerDismissTap
    }
}
