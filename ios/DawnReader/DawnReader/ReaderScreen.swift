import SwiftUI

struct ReaderScreen: View {
    @EnvironmentObject private var settings: SettingsStore
    @ObservedObject private var session: ReadingSession
    let openedBook: OpenedBook
    let onClose: () -> Void
    @State private var showingSettings = false
    @State private var scrubProgress: Double?

    init(openedBook: OpenedBook, onClose: @escaping () -> Void) {
        self.openedBook = openedBook
        self.onClose = onClose
        _session = ObservedObject(wrappedValue: openedBook.session)
    }

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .topLeading) {
                chromeBackground.ignoresSafeArea()
                VStack(spacing: 0) {
                    topBar
                    ReaderControllerView(
                        controller: openedBook.controller,
                        mode: session.pencilMode,
                        appearance: settings.readerAppearance
                    )
                    bottomBar
                }
                if session.rewriteState != .idle {
                    rewriteCard(in: geometry.size)
                }
            }
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView().environmentObject(settings)
        }
        .preferredColorScheme(settings.readerTheme == .night ? .dark : .light)
    }

    private var topBar: some View {
        HStack(spacing: 18) {
            Button(action: onClose) {
                Label("书架", systemImage: "chevron.left")
                    .labelStyle(.titleAndIcon)
            }
            .buttonStyle(.plain)
            Text(session.title)
                .font(.system(size: 16, weight: .medium, design: .serif))
                .lineLimit(1)
            Spacer()
            HStack(spacing: 2) {
                ForEach(PencilMode.allCases) { mode in
                    Button(mode.title) {
                        if session.pencilMode != mode {
                            session.pencilMode = mode
                            session.clearSelection()
                        }
                    }
                    .font(.caption.weight(.medium))
                    .padding(.horizontal, 13)
                    .padding(.vertical, 8)
                    .background(session.pencilMode == mode ? Palette.ember : .clear)
                    .foregroundStyle(session.pencilMode == mode ? Color.white.opacity(0.92) : chromeForeground.opacity(0.65))
                }
            }
            .padding(3)
            .background(chromeForeground.opacity(0.10), in: RoundedRectangle(cornerRadius: 8))
            Button {
                showingSettings = true
            } label: {
                Image(systemName: "slider.horizontal.3")
            }
            .buttonStyle(.plain)
        }
        .foregroundStyle(chromeForeground)
        .padding(.horizontal, 20)
        .frame(height: 58)
        .background(chromeForeground.opacity(0.04))
    }

    private var bottomBar: some View {
        HStack(spacing: 24) {
            Button { session.goBackward?() } label: {
                Image(systemName: "arrow.left")
            }
            Slider(
                value: Binding(
                    get: { scrubProgress ?? session.progress },
                    set: { scrubProgress = $0 }
                ),
                in: 0 ... 1,
                onEditingChanged: { editing in
                    guard !editing, let target = scrubProgress else { return }
                    session.seek?(target)
                    scrubProgress = nil
                }
            )
                .tint(Palette.ember)
                .frame(maxWidth: 360)
                .accessibilityLabel("阅读进度")
                .accessibilityValue("\(Int(effectiveProgress * 100))%")
            Text("\(Int(effectiveProgress * 100))%")
                .font(.caption.monospacedDigit())
                .foregroundStyle(chromeForeground.opacity(0.65))
                .frame(width: 38, alignment: .trailing)
            Button { session.goForward?() } label: {
                Image(systemName: "arrow.right")
            }
        }
        .buttonStyle(.plain)
        .foregroundStyle(chromeForeground)
        .frame(height: 52)
    }

    private var chromeBackground: Color {
        Palette.readerBackground(for: settings.readerTheme)
    }

    private var chromeForeground: Color {
        Palette.readerText(for: settings.readerTheme)
    }

    private var effectiveProgress: Double {
        scrubProgress ?? session.progress
    }

    @ViewBuilder
    private func rewriteCard(in size: CGSize) -> some View {
        let frame = session.selectionFrame ?? CGRect(x: 30, y: 120, width: 1, height: 1)
        let cardWidth = min(380.0, size.width - 40)
        let proposedX = frame.midX - cardWidth / 2
        let x = min(max(20, proposedX), size.width - cardWidth - 20)
        let y = min(max(74, frame.minY + 62 - 130), size.height - 220)

        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(cardTitle)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Palette.ember)
                Spacer()
                if session.assistanceMode == .english {
                    Button("中文详解") {
                        session.explainInChinese()
                    }
                    .font(.caption.weight(.medium))
                    .foregroundStyle(Palette.ember)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background(Palette.ember.opacity(0.09), in: RoundedRectangle(cornerRadius: 6))
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                    .buttonStyle(.plain)
                }
                Button {
                    session.clearSelection()
                } label: {
                    Image(systemName: "xmark")
                        .font(.caption.weight(.semibold))
                }
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
                .buttonStyle(.plain)
            }
            switch session.rewriteState {
            case .idle:
                EmptyView()
            case .loading:
                HStack(spacing: 9) {
                    ProgressView().controlSize(.small)
                    Text(loadingTitle)
                        .foregroundStyle(chromeForeground.opacity(0.68))
                }
            case let .complete(text):
                Text(text)
                    .font(.system(size: 17, weight: .regular, design: .serif))
                    .foregroundStyle(chromeForeground)
                    .fixedSize(horizontal: false, vertical: true)
            case let .failed(message):
                Text(message)
                    .font(.callout)
                    .foregroundStyle(chromeForeground.opacity(0.68))
            }
        }
        .padding(16)
        .frame(width: cardWidth, alignment: .leading)
        .background(Palette.readerCardBackground(for: settings.readerTheme), in: RoundedRectangle(cornerRadius: 10))
        .overlay(alignment: .top) {
            Rectangle().fill(Palette.ember).frame(height: 2)
        }
        .shadow(color: Color.black.opacity(settings.readerTheme == .night ? 0.28 : 0.12), radius: 18, y: 8)
        .offset(x: x, y: y)
    }

    private var cardTitle: String {
        if session.assistanceMode == .chinese { return "中文详解" }
        return AIClient.isSingleWord(session.selectedText) ? "读音与词义" : "简明英文"
    }

    private var loadingTitle: String {
        if session.assistanceMode == .chinese { return "正在生成中文解释…" }
        return AIClient.isSingleWord(session.selectedText) ? "正在查询读音与词义…" : "正在改写…"
    }
}

private struct ReaderControllerView: UIViewControllerRepresentable {
    let controller: ReaderHostViewController
    let mode: PencilMode
    let appearance: ReaderAppearance

    func makeUIViewController(context: Context) -> ReaderHostViewController {
        controller
    }

    func updateUIViewController(_ uiViewController: ReaderHostViewController, context: Context) {
        uiViewController.apply(mode: mode, appearance: appearance)
    }
}
