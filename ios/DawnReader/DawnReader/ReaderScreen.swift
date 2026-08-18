import SwiftUI
import ReadiumShared
import UIKit

struct ReaderScreen: View {
    @EnvironmentObject private var settings: SettingsStore
    @EnvironmentObject private var evidenceStore: ReadingEvidenceStore
    @Environment(\.scenePhase) private var scenePhase
    @ObservedObject private var session: ReadingSession
    let openedBook: OpenedBook
    let onClose: () -> Void
    @State private var showingSettings = false
    @State private var showingContents = false
    @State private var scrubProgress: Double?
    @State private var chatDraft = ""
    @State private var assistantDetent: PresentationDetent = .medium
    @FocusState private var chatFocused: Bool

    init(openedBook: OpenedBook, onClose: @escaping () -> Void) {
        self.openedBook = openedBook
        self.onClose = onClose
        _session = ObservedObject(wrappedValue: openedBook.session)
    }

    private var deviceClass: DawnDeviceClass {
        UIDevice.current.userInterfaceIdiom == .phone ? .phone : .pad
    }

    private var presentation: DawnPresentationPolicy {
        DawnPresentationPolicy(deviceClass: deviceClass)
    }

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .topLeading) {
                chromeBackground.ignoresSafeArea()
                VStack(spacing: 0) {
                    topBar
                    if session.isReferenceMode {
                        referenceBanner
                    }
                    ReaderControllerView(
                        controller: openedBook.controller,
                        mode: session.pencilMode,
                        appearance: settings.readerAppearance
                    )
                    bottomBar
                }
                if presentation.assistantPresentation == .selectionAdjacent,
                   !session.selectedText.isEmpty
                {
                    selectionAdjacentAssistant(in: geometry.size)
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
        .sheet(isPresented: phoneAssistantPresented) {
            phoneAssistantSheet
        }
        .onChange(of: session.selectedText) { _, selectedText in
            guard presentation.assistantPresentation == .bottomSheet,
                  !selectedText.isEmpty else { return }
            assistantDetent = session.assistantMode == .ask ? .large : .medium
        }
        .onAppear {
            session.attachEvidenceStore(evidenceStore)
            session.setReadingActive(scenePhase == .active)
            session.recordActivity()
        }
        .onDisappear {
            session.closeReadingSession()
        }
        .onChange(of: scenePhase) { _, phase in
            session.setReadingActive(phase == .active)
        }
        .task(id: evidenceTaskID) {
            guard scenePhase == .active,
                  let presentationID = session.evidencePresentationID else { return }
            try? await Task.sleep(for: .seconds(1))
            guard !Task.isCancelled,
                  scenePhase == .active,
                  session.evidencePresentationID == presentationID else { return }
            session.confirmPresentedEvidence(presentationID)
        }
        .preferredColorScheme(settings.readerTheme == .night ? .dark : .light)
    }

    private var evidenceTaskID: String {
        "\(session.evidencePresentationID?.uuidString ?? "none"):\(String(describing: scenePhase))"
    }

    private var referenceBanner: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 1) {
                Text("正在回看记录")
                    .font(.caption.weight(.semibold))
                Text("不会改动原来的阅读位置")
                    .font(.caption2)
                    .foregroundStyle(chromeForeground.opacity(0.58))
            }
            Spacer(minLength: 4)
            Button("返回原位置") {
                if let action = session.returnFromReference {
                    action()
                } else {
                    onClose()
                }
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            Button("从这里继续") {
                session.continueFromReference()
            }
            .buttonStyle(.borderedProminent)
            .tint(Palette.ember)
            .controlSize(.small)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .foregroundStyle(chromeForeground)
        .background(Palette.ember.opacity(0.08))
        .overlay(alignment: .bottom) {
            Divider().overlay(Palette.ember.opacity(0.25))
        }
    }

    @ViewBuilder
    private var topBar: some View {
        if deviceClass == .phone {
            phoneTopBar
        } else {
            padTopBar
        }
    }

    private var phoneTopBar: some View {
        HStack(spacing: 2) {
            readerIconButton(
                systemName: "chevron.left",
                accessibilityLabel: "返回书架",
                action: onClose
            )

            Text(session.title)
                .font(.system(.subheadline, design: .serif).weight(.medium))
                .lineLimit(1)
                .truncationMode(.tail)
                .frame(maxWidth: .infinity, alignment: .leading)
                .layoutPriority(1)
                .accessibilityLabel("正在阅读《\(session.title)》")

            readerIconButton(
                systemName: "list.bullet.indent",
                accessibilityLabel: "查看目录"
            ) {
                showingContents = true
            }

            readerIconButton(
                systemName: "slider.horizontal.3",
                accessibilityLabel: "阅读设置"
            ) {
                showingSettings = true
            }
        }
        .foregroundStyle(chromeForeground)
        .padding(.horizontal, 2)
        .frame(height: presentation.readerTopBarHeight)
        .background(chromeForeground.opacity(0.04))
    }

    private var padTopBar: some View {
        HStack(spacing: 14) {
            Button(action: onClose) {
                Label("书架", systemImage: "chevron.left")
                    .labelStyle(.titleAndIcon)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("返回书架")

            Text(session.title)
                .font(.system(size: 16, weight: .medium, design: .serif))
                .lineLimit(1)
                .truncationMode(.tail)
                .layoutPriority(1)
            Spacer(minLength: 8)

            Button {
                showingContents = true
            } label: {
                Label("目录", systemImage: "list.bullet.indent")
                    .labelStyle(.titleAndIcon)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("查看目录")

            if presentation.showsPencilControls {
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
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                        .background(session.pencilMode == mode ? Palette.ember : .clear)
                        .foregroundStyle(session.pencilMode == mode ? Color.white.opacity(0.92) : chromeForeground.opacity(0.65))
                        .accessibilityLabel("Apple Pencil \(mode.title)模式")
                        .accessibilityAddTraits(session.pencilMode == mode ? .isSelected : [])
                    }
                }
                .padding(3)
                .background(chromeForeground.opacity(0.10), in: RoundedRectangle(cornerRadius: 8))
            }

            readerIconButton(
                systemName: "slider.horizontal.3",
                accessibilityLabel: "阅读设置"
            ) {
                showingSettings = true
            }
        }
        .foregroundStyle(chromeForeground)
        .padding(.horizontal, 20)
        .frame(height: presentation.readerTopBarHeight)
        .background(chromeForeground.opacity(0.04))
    }

    private func readerIconButton(
        systemName: String,
        accessibilityLabel: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 16, weight: .semibold))
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel)
    }

    private var bottomBar: some View {
        HStack(spacing: deviceClass == .phone ? 6 : 18) {
            Button { session.goBackward?() } label: {
                Image(systemName: "arrow.left")
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
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
            .frame(maxWidth: deviceClass == .phone ? .infinity : 360)
            .layoutPriority(1)
            .accessibilityLabel("阅读进度")
            .accessibilityValue("\(Int(effectiveProgress * 100))%")

            Text("\(Int(effectiveProgress * 100))%")
                .font(.caption.monospacedDigit())
                .foregroundStyle(chromeForeground.opacity(0.65))
                .frame(width: deviceClass == .phone ? 34 : 38, alignment: .trailing)
                .accessibilityHidden(true)

            Button { session.goForward?() } label: {
                Image(systemName: "arrow.right")
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("下一页")
        }
        .buttonStyle(.plain)
        .foregroundStyle(chromeForeground)
        .padding(.horizontal, deviceClass == .phone ? 2 : 16)
        .frame(height: presentation.readerBottomBarHeight)
        .background(chromeForeground.opacity(0.025))
        .overlay(alignment: .top) {
            bottomReadingRail
        }
    }

    private var bottomReadingRail: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                Rectangle()
                    .fill(chromeForeground.opacity(0.10))
                    .frame(height: 1)
                Rectangle()
                    .fill(Palette.ember)
                    .frame(
                        width: max(effectiveProgress > 0 ? 2 : 0, geometry.size.width * effectiveProgress),
                        height: 2
                    )
            }
        }
        .frame(height: 2)
        .accessibilityHidden(true)
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

    private var phoneAssistantPresented: Binding<Bool> {
        Binding(
            get: {
                presentation.assistantPresentation == .bottomSheet && !session.selectedText.isEmpty
            },
            set: { presented in
                if !presented, !session.selectedText.isEmpty {
                    chatFocused = false
                    session.clearSelection()
                }
            }
        )
    }

    private var phoneAssistantSheet: some View {
        VStack(spacing: 0) {
            phoneAssistantHeader
            Divider()
                .overlay(chromeForeground.opacity(0.12))
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    selectedContextCard(lineLimit: nil)
                    if session.assistantMode == .ask {
                        phoneChatTranscript
                    } else {
                        phoneRewriteContent
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 14)
                .padding(.bottom, 24)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if session.assistantMode == .ask {
                VStack(spacing: 0) {
                    Divider()
                        .overlay(chromeForeground.opacity(0.12))
                    phoneChatComposer
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                }
                .background(Palette.readerCardBackground(for: settings.readerTheme))
            }
        }
        .background(Palette.readerCardBackground(for: settings.readerTheme))
        .foregroundStyle(chromeForeground)
        .presentationDetents([.medium, .large], selection: $assistantDetent)
        .presentationDragIndicator(.visible)
        .presentationContentInteraction(.scrolls)
        .presentationBackground(Palette.readerCardBackground(for: settings.readerTheme))
        .preferredColorScheme(settings.readerTheme == .night ? .dark : .light)
        .onAppear {
            guard session.assistantMode == .ask else { return }
            assistantDetent = .large
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(250))
                guard !session.selectedText.isEmpty else { return }
                chatFocused = true
            }
        }
    }

    private var phoneAssistantHeader: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(cardTitle)
                        .font(.system(.headline, design: .serif).weight(.semibold))
                        .foregroundStyle(Palette.ember)
                        .lineLimit(1)
                    if session.assistantMode == .ask {
                        Text(DawnSyncClient.normalizePairingCode(settings.syncCode) == nil ? "局部上下文 · 本机模型" : "局部上下文 · 必要时搜索")
                            .font(.caption2.monospaced())
                            .foregroundStyle(chromeForeground.opacity(0.55))
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 4)
                Button {
                    chatFocused = false
                    session.clearSelection()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .semibold))
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("关闭解释")
            }

            if session.assistantMode == .rewrite,
               session.assistanceMode == .english,
               case .complete = session.rewriteState
            {
                Button("中文详解") {
                    session.explainInChinese()
                    assistantDetent = .large
                }
                .font(.callout.weight(.medium))
                .foregroundStyle(Palette.ember)
                .frame(minHeight: 44)
                .padding(.horizontal, 12)
                .background(Palette.ember.opacity(0.09), in: RoundedRectangle(cornerRadius: 8))
                .buttonStyle(.plain)
                .accessibilityHint("用中文翻译并解释当前选中内容")
            }
        }
        .padding(.leading, 16)
        .padding(.trailing, 8)
        .padding(.top, 6)
        .padding(.bottom, 8)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(Palette.ember)
                .frame(height: 2)
        }
    }

    private func selectedContextCard(lineLimit: Int?) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("选中原文")
                .font(.caption2.monospaced())
                .foregroundStyle(chromeForeground.opacity(0.52))
            Text(session.selectedText)
                .font(.system(.callout, design: .serif))
                .foregroundStyle(chromeForeground.opacity(0.75))
                .lineLimit(lineLimit)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(chromeForeground.opacity(0.055), in: RoundedRectangle(cornerRadius: 8))
        .overlay(alignment: .leading) {
            Rectangle()
                .fill(Palette.ember)
                .frame(width: 2)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("选中原文：\(session.selectedText)")
    }

    @ViewBuilder
    private var phoneRewriteContent: some View {
        switch session.rewriteState {
        case .idle:
            EmptyView()
        case .loading:
            HStack(spacing: 10) {
                ProgressView()
                Text(loadingTitle)
                    .font(.callout)
                    .foregroundStyle(chromeForeground.opacity(0.68))
            }
            .frame(minHeight: 44)
            .accessibilityElement(children: .combine)
        case let .complete(text):
            Text(text)
                .font(.system(.body, design: .serif))
                .foregroundStyle(chromeForeground)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)
                .accessibilityLabel(cardTitle)
                .accessibilityValue(text)
        case let .failed(message):
            Label(message, systemImage: "exclamationmark.triangle")
                .font(.callout)
                .foregroundStyle(chromeForeground.opacity(0.72))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var phoneChatTranscript: some View {
        VStack(alignment: .leading, spacing: 16) {
            if session.chatMessages.isEmpty {
                Text("在下方输入你想弄懂的问题。回答会始终保留这段原文及其附近上下文。")
                    .font(.callout)
                    .foregroundStyle(chromeForeground.opacity(0.62))
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                ForEach(Array(session.chatMessages.enumerated()), id: \.offset) { _, message in
                    VStack(alignment: .leading, spacing: 5) {
                        Text(message.role == "user" ? "你" : "AI")
                            .font(.caption2.monospaced())
                            .foregroundStyle(message.role == "user" ? chromeForeground.opacity(0.5) : Palette.ember)
                        Text(message.content)
                            .font(.system(.body, design: .serif))
                            .foregroundStyle(chromeForeground.opacity(message.role == "user" ? 0.72 : 1))
                            .fixedSize(horizontal: false, vertical: true)
                            .textSelection(.enabled)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
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
                .frame(minHeight: 44)
                .accessibilityElement(children: .combine)
            case let .failed(message):
                Label(message, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.red.opacity(0.82))
                    .fixedSize(horizontal: false, vertical: true)
            }

            if !session.chatSources.isEmpty {
                Divider()
                Text("来源")
                    .font(.caption2.monospaced())
                    .foregroundStyle(chromeForeground.opacity(0.52))
                ForEach(Array(session.chatSources.enumerated()), id: \.offset) { index, source in
                    Link(destination: source.url) {
                        HStack(alignment: .firstTextBaseline, spacing: 7) {
                            Text("[\(index + 1)]")
                                .font(.caption.monospacedDigit())
                            Text(source.title)
                                .font(.callout)
                                .multilineTextAlignment(.leading)
                                .lineLimit(3)
                            Spacer(minLength: 4)
                            Image(systemName: "arrow.up.right")
                                .font(.caption2)
                        }
                        .foregroundStyle(Palette.ember)
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .accessibilityLabel("来源 \(index + 1)：\(source.title)")
                }
            }
        }
    }

    private var phoneChatComposer: some View {
        HStack(alignment: .bottom, spacing: 8) {
            TextField(session.chatMessages.isEmpty ? "你想弄懂什么？" : "继续问…", text: $chatDraft, axis: .vertical)
                .lineLimit(1 ... 5)
                .textFieldStyle(.plain)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .frame(minHeight: 44)
                .background(chromeForeground.opacity(0.055), in: RoundedRectangle(cornerRadius: 10))
                .focused($chatFocused)
                .submitLabel(.send)
                .onSubmit(sendChatQuestion)
                .accessibilityLabel("向 AI 提问")

            Button(action: sendChatQuestion) {
                Image(systemName: "arrow.up")
                    .font(.system(size: 14, weight: .bold))
                    .frame(width: 44, height: 44)
                    .foregroundStyle(Color.white)
                    .background(Palette.ember, in: Circle())
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(chatDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || session.chatState == .loading)
            .opacity(chatDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.45 : 1)
            .accessibilityLabel("发送问题")
        }
    }

    @ViewBuilder
    private func selectionAdjacentAssistant(in size: CGSize) -> some View {
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
            selectedContextCard(lineLimit: 2)

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
        return AIClient.isSingleWord(session.selectedText) ? "读音与词义" : "简明英文"
    }

    private var loadingTitle: String {
        if session.assistanceMode == .chinese { return "正在生成中文解释…" }
        return AIClient.isSingleWord(session.selectedText) ? "正在查询读音与词义…" : "正在改写…"
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
