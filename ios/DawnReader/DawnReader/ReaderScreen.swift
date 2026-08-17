import SwiftUI
import ReadiumShared

struct ReaderScreen: View {
    @EnvironmentObject private var settings: SettingsStore
    @ObservedObject private var session: ReadingSession
    let openedBook: OpenedBook
    let onClose: () -> Void
    @State private var showingSettings = false
    @State private var showingContents = false
    @State private var scrubProgress: Double?
    @State private var chatDraft = ""
    @FocusState private var chatFocused: Bool

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
                if !session.selectedText.isEmpty {
                    rewriteCard(in: geometry.size)
                }
            }
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView().environmentObject(settings)
        }
        .sheet(isPresented: $showingContents) {
            contentsSheet
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
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
            Button {
                showingContents = true
            } label: {
                Label("目录", systemImage: "list.bullet.indent")
                    .labelStyle(.titleAndIcon)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("查看目录")
            HStack(spacing: 2) {
                ForEach(PencilMode.allCases) { mode in
                    Button(mode.title) {
                        if session.pencilMode != mode {
                            session.pencilMode = mode
                            settings.pencilMode = mode
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
            .accessibilityLabel("阅读设置")
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
            .accessibilityLabel("上一页")
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
            .accessibilityLabel("下一页")
        }
        .buttonStyle(.plain)
        .foregroundStyle(chromeForeground)
        .frame(height: 52)
    }

    private var contentsSheet: some View {
        NavigationStack {
            Group {
                if session.tableOfContents.isEmpty {
                    ContentUnavailableView("这本书没有目录", systemImage: "list.bullet.indent", description: Text("EPUB 没有提供可用的章节目录。"))
                } else {
                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVStack(spacing: 0) {
                                ContentsRows(
                                    links: session.tableOfContents,
                                    isCurrent: session.isCurrentChapter,
                                    onSelect: { link in
                                        session.goToChapter?(link)
                                        showingContents = false
                                    }
                                )
                            }
                            .padding(.vertical, 10)
                        }
                        .onAppear {
                            if let current = currentContentsHref(in: session.tableOfContents) {
                                proxy.scrollTo(current, anchor: .center)
                            }
                        }
                    }
                }
            }
            .background(chromeBackground)
            .foregroundStyle(chromeForeground)
            .navigationTitle("目录")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("完成") { showingContents = false }
                }
            }
        }
        .preferredColorScheme(settings.readerTheme == .night ? .dark : .light)
    }

    private func currentContentsHref(in links: [ReadiumShared.Link]) -> String? {
        for link in links {
            if session.isCurrentChapter(link) { return link.href }
            if let child = currentContentsHref(in: link.children) { return child }
        }
        return nil
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
        let cardWidth = min(session.assistantMode == .ask ? 430.0 : 380.0, size.width - 40)
        let proposedX = frame.midX - cardWidth / 2
        let x = min(max(20, proposedX), size.width - cardWidth - 20)
        let minimumRoom = session.assistantMode == .ask ? 500.0 : 220.0
        let y = min(max(74, frame.minY + 62 - 130), max(74, size.height - minimumRoom))

        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(cardTitle)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Palette.ember)
                Spacer()
                if session.assistantMode == .ask {
                    Text(DawnSyncClient.normalizePairingCode(settings.syncCode) == nil ? "局部上下文" : "局部上下文 · 可联网")
                        .font(.caption2.monospaced())
                        .foregroundStyle(chromeForeground.opacity(0.52))
                }
                if session.assistantMode == .rewrite,
                   session.assistanceMode == .english,
                   case .complete = session.rewriteState {
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
                .accessibilityLabel("关闭解释")
            }
            if session.assistantMode == .ask {
                chatContent
            } else {
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

    private var chatContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("选中")
                    .font(.caption2.monospaced())
                    .foregroundStyle(chromeForeground.opacity(0.5))
                Text(session.selectedText)
                    .font(.system(size: 13, design: .serif))
                    .foregroundStyle(chromeForeground.opacity(0.64))
                    .lineLimit(2)
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(chromeForeground.opacity(0.055))
            .overlay(alignment: .leading) {
                Rectangle().fill(Palette.ember).frame(width: 2)
            }

            if !session.chatMessages.isEmpty {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        ForEach(Array(session.chatMessages.enumerated()), id: \.offset) { _, message in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(message.role == "user" ? "你" : "AI")
                                    .font(.caption2.monospaced())
                                    .foregroundStyle(message.role == "user" ? chromeForeground.opacity(0.5) : Palette.ember)
                                Text(message.content)
                                    .font(.system(size: 15, design: .serif))
                                    .foregroundStyle(chromeForeground.opacity(message.role == "user" ? 0.68 : 1))
                                    .textSelection(.enabled)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        if !session.chatSources.isEmpty {
                            Divider()
                            Text("来源")
                                .font(.caption2.monospaced())
                                .foregroundStyle(chromeForeground.opacity(0.5))
                            ForEach(Array(session.chatSources.enumerated()), id: \.offset) { index, source in
                                Link("[\(index + 1)] \(source.title)", destination: source.url)
                                    .font(.caption)
                                    .foregroundStyle(Palette.ember)
                                    .lineLimit(1)
                            }
                        }
                    }
                }
                .frame(maxHeight: 260)
            }

            switch session.chatState {
            case .idle:
                EmptyView()
            case .loading:
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text(DawnSyncClient.normalizePairingCode(settings.syncCode) == nil ? "正在结合上下文思考…" : "正在阅读，必要时搜索…")
                        .font(.caption)
                        .foregroundStyle(chromeForeground.opacity(0.62))
                }
            case let .failed(message):
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.red.opacity(0.8))
            }

            HStack(alignment: .bottom, spacing: 8) {
                TextField(session.chatMessages.isEmpty ? "你想弄懂什么？" : "继续问…", text: $chatDraft, axis: .vertical)
                    .lineLimit(1 ... 4)
                    .textFieldStyle(.plain)
                    .padding(.horizontal, 11)
                    .padding(.vertical, 10)
                    .background(chromeForeground.opacity(0.055), in: RoundedRectangle(cornerRadius: 8))
                    .focused($chatFocused)
                    .onSubmit(sendChatQuestion)
                Button(action: sendChatQuestion) {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 14, weight: .bold))
                        .frame(width: 38, height: 38)
                        .foregroundStyle(Color.white)
                        .background(Palette.ember, in: Circle())
                }
                .buttonStyle(.plain)
                .disabled(chatDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || session.chatState == .loading)
                .opacity(chatDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.45 : 1)
                .accessibilityLabel("发送问题")
            }
        }
        .onAppear { chatFocused = true }
    }

    private func sendChatQuestion() {
        let question = chatDraft
        guard !question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        chatDraft = ""
        session.ask(question)
    }

    private var cardTitle: String {
        if session.assistantMode == .ask { return "问这段内容" }
        if session.assistanceMode == .chinese { return "中文详解" }
        switch AIClient.selectionKind(session.selectedText) {
        case .word: return "读音与词义"
        case .phrase: return "短语含义"
        case .passage: return "简明英文"
        }
    }

    private var loadingTitle: String {
        if session.assistanceMode == .chinese { return "正在生成中文解释…" }
        switch AIClient.selectionKind(session.selectedText) {
        case .word: return "正在查询读音与词义…"
        case .phrase: return "正在解释短语…"
        case .passage: return "正在改写…"
        }
    }
}

private struct ContentsRows: View {
    let links: [ReadiumShared.Link]
    let isCurrent: (ReadiumShared.Link) -> Bool
    let onSelect: (ReadiumShared.Link) -> Void
    var depth = 0

    var body: some View {
        ForEach(Array(links.enumerated()), id: \.offset) { _, link in
            let current = isCurrent(link)
            Button {
                onSelect(link)
            } label: {
                HStack(spacing: 12) {
                    Rectangle()
                        .fill(current ? Palette.ember : .clear)
                        .frame(width: 2)
                    Text(link.title?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? "未命名章节")
                        .font(.system(size: 16, weight: current ? .medium : .regular, design: .serif))
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 8)
                    if current {
                        Text("正在阅读")
                            .font(.caption2.monospaced())
                            .foregroundStyle(Palette.ember)
                    }
                }
                .padding(.leading, CGFloat(min(depth, 4) * 18 + 18))
                .padding(.trailing, 18)
                .frame(minHeight: 50)
                .contentShape(Rectangle())
                .background(current ? Palette.ember.opacity(0.09) : .clear)
            }
            .buttonStyle(.plain)
            .id(link.href)

            if !link.children.isEmpty {
                ContentsRows(
                    links: link.children,
                    isCurrent: isCurrent,
                    onSelect: onSelect,
                    depth: depth + 1
                )
            }
        }
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
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
