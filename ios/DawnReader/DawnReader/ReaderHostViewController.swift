import ReadiumNavigator
import ReadiumShared
import UIKit

@MainActor
final class ReaderHostViewController: UIViewController, EPUBNavigatorDelegate, UIGestureRecognizerDelegate, UIPencilInteractionDelegate {
    private let navigator: EPUBNavigatorViewController
    private let session: ReadingSession
    private lazy var pencilPan = UIPanGestureRecognizer(target: self, action: #selector(handlePencilPan(_:)))
    private let strokeLayer = CAShapeLayer()
    private var selectionStart: CGPoint?

    init(publication: Publication, initialLocatorJSON: String?, session: ReadingSession) throws {
        let locator = initialLocatorJSON.flatMap { try? Locator(jsonString: $0) }
        let preferences = EPUBPreferences(
            columnCount: .two,
            fontSize: 1.0,
            lineHeight: 1.55,
            pageMargins: 1.15,
            paragraphSpacing: 0.75,
            publisherStyles: false,
            scroll: false,
            spread: .always,
            textAlign: .start,
            theme: .light
        )
        navigator = try EPUBNavigatorViewController(
            publication: publication,
            initialLocation: locator,
            config: .init(
                preferences: preferences,
                contentInset: [
                    .compact: (top: 0, bottom: 0),
                    .regular: (top: 0, bottom: 0),
                ]
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

        pencilPan.allowedTouchTypes = [NSNumber(value: UITouch.TouchType.pencil.rawValue)]
        pencilPan.delegate = self
        pencilPan.maximumNumberOfTouches = 1
        navigator.view.addGestureRecognizer(pencilPan)

        strokeLayer.fillColor = UIColor.clear.cgColor
        strokeLayer.strokeColor = UIColor(red: 0.73, green: 0.34, blue: 0.18, alpha: 0.62).cgColor
        strokeLayer.lineWidth = 3
        strokeLayer.lineCap = .round
        navigator.view.layer.addSublayer(strokeLayer)

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
        }
    }

    func apply(mode: PencilMode) {
        if mode == .page {
            clearStroke()
        }
    }

    @objc private func handlePencilPan(_ gesture: UIPanGestureRecognizer) {
        let location = gesture.location(in: navigator.view)
        switch gesture.state {
        case .began:
            let translation = gesture.translation(in: navigator.view)
            selectionStart = CGPoint(x: location.x - translation.x, y: location.y - translation.y)
            if session.pencilMode == .select, let start = selectionStart {
                drawStroke(from: start, to: location)
            }
        case .changed:
            if session.pencilMode == .select, let start = selectionStart {
                drawStroke(from: start, to: location)
            }
        case .ended:
            guard let start = selectionStart else { return }
            selectionStart = nil
            if session.pencilMode == .page {
                let translation = gesture.translation(in: navigator.view)
                guard abs(translation.x) > 56, abs(translation.x) > abs(translation.y) else { return }
                session.clearSelection()
                if translation.x < 0 {
                    session.goForward?()
                } else {
                    session.goBackward?()
                }
            } else {
                clearStroke(after: 0.18)
                guard hypot(location.x - start.x, location.y - start.y) > 12 else { return }
                let script = PencilSelectionScript.make(start: start, end: location, nativeSize: navigator.view.bounds.size)
                Task {
                    _ = await navigator.evaluateJavaScript(script)
                    try? await Task.sleep(for: .milliseconds(140))
                    if let selection = navigator.currentSelection {
                        session.handle(selection: selection)
                    }
                }
            }
        case .cancelled, .failed:
            selectionStart = nil
            clearStroke()
        default:
            break
        }
    }

    private func drawStroke(from start: CGPoint, to end: CGPoint) {
        let path = UIBezierPath()
        path.move(to: start)
        path.addLine(to: end)
        strokeLayer.path = path.cgPath
    }

    private func clearStroke(after delay: TimeInterval = 0) {
        guard delay > 0 else {
            strokeLayer.path = nil
            return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            self?.strokeLayer.path = nil
        }
    }

    func pencilInteractionDidTap(_ interaction: UIPencilInteraction) {
        session.togglePencilMode()
    }

    func navigator(_ navigator: Navigator, locationDidChange locator: Locator) {
        session.updateLocation(locator)
    }

    func navigator(_ navigator: SelectableNavigator, shouldShowMenuForSelection selection: Selection) -> Bool {
        session.handle(selection: selection)
        return false
    }

    func navigator(_ navigator: Navigator, presentError error: NavigatorError) {
        session.rewriteState = .failed("阅读器无法完成这个操作。")
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
        false
    }
}
