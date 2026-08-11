import SwiftUI

struct ReaderScreen: View {
    @EnvironmentObject private var settings: SettingsStore
    @ObservedObject private var session: ReadingSession
    let openedBook: OpenedBook
    let onClose: () -> Void
    @State private var showingSettings = false

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
                    .foregroundStyle(session.pencilMode == mode ? Color.white : chromeForeground.opacity(0.65))
                }
            }
            .padding(3)
            .background(Palette.line.opacity(0.45), in: RoundedRectangle(cornerRadius: 8))
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
            ProgressView(value: session.progress)
                .tint(Palette.ember)
                .frame(maxWidth: 300)
            Text("\(Int(session.progress * 100))%")
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
        switch settings.readerTheme {
        case .paper: Palette.fog
        case .sepia: Color(red: 0.90, green: 0.86, blue: 0.76)
        case .night: Color(red: 0.06, green: 0.07, blue: 0.07)
        }
    }

    private var chromeForeground: Color {
        settings.readerTheme == .night ? Color(red: 0.88, green: 0.89, blue: 0.87) : Palette.ink
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
                Text("简明英文")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Palette.ember)
                Spacer()
                Button {
                    session.clearSelection()
                } label: {
                    Image(systemName: "xmark")
                        .font(.caption.weight(.semibold))
                }
                .buttonStyle(.plain)
            }
            switch session.rewriteState {
            case .idle:
                EmptyView()
            case .loading:
                HStack(spacing: 9) {
                    ProgressView().controlSize(.small)
                    Text("正在改写…")
                        .foregroundStyle(Palette.mutedInk)
                }
            case let .complete(text):
                Text(text)
                    .font(.system(size: 17, weight: .regular, design: .serif))
                    .foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
            case let .failed(message):
                Text(message)
                    .font(.callout)
                    .foregroundStyle(Palette.mutedInk)
            }
        }
        .padding(16)
        .frame(width: cardWidth, alignment: .leading)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 10))
        .overlay(alignment: .top) {
            Rectangle().fill(Palette.ember).frame(height: 2)
        }
        .shadow(color: Palette.ink.opacity(0.12), radius: 18, y: 8)
        .offset(x: x, y: y)
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
