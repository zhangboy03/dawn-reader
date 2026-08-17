import SwiftUI
import UniformTypeIdentifiers

struct LibraryView: View {
    @EnvironmentObject private var library: LibraryModel
    @EnvironmentObject private var settings: SettingsStore
    @State private var importing = false
    @State private var showingSettings = false
    @State private var bookToDelete: BookRecord?
    @State private var isDropTarget = false
    @Environment(\.scenePhase) private var scenePhase

    private let epubType = UTType(filenameExtension: "epub")!

    var body: some View {
        NavigationStack {
            ZStack {
                Palette.fog.ignoresSafeArea()
                VStack(alignment: .leading, spacing: 24) {
                    header
                    if let notice = library.importNotice {
                        Label(notice, systemImage: "checkmark.circle.fill")
                            .font(.callout)
                            .foregroundStyle(Palette.ember)
                            .transition(.move(edge: .top).combined(with: .opacity))
                    }
                    if library.books.isEmpty {
                        emptyLibrary
                    } else {
                        bookList
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 34)
                .padding(.vertical, 28)
                if isDropTarget {
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Palette.ember, style: StrokeStyle(lineWidth: 3, dash: [10, 8]))
                        .padding(12)
                        .allowsHitTesting(false)
                }
            }
            .toolbar(.hidden, for: .navigationBar)
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [epubType], allowsMultipleSelection: true) { result in
            guard case let .success(urls) = result else { return }
            Task { await library.importBooks(from: urls, settings: settings) }
        }
        .onOpenURL { url in
            guard url.pathExtension.lowercased() == "epub" else { return }
            Task { await library.importBook(from: url, settings: settings) }
        }
        .dropDestination(for: URL.self) { urls, _ in
            let epubs = urls.filter { $0.pathExtension.lowercased() == "epub" }
            guard !epubs.isEmpty else { return false }
            Task { await library.importBooks(from: epubs, settings: settings) }
            return true
        } isTargeted: { targeted in
            isDropTarget = targeted
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView()
                .environmentObject(settings)
        }
        .fullScreenCover(item: $library.openedBook) { opened in
            ReaderScreen(openedBook: opened, onClose: library.closeReader)
                .environmentObject(settings)
        }
        .alert("无法完成", isPresented: Binding(
            get: { library.errorMessage != nil },
            set: { if !$0 { library.errorMessage = nil } }
        )) {
            Button("好", role: .cancel) {}
        } message: {
            Text(library.errorMessage ?? "")
        }
        .task {
            await library.synchronize(settings: settings)
        }
        .onReceive(NotificationCenter.default.publisher(for: .dawnReaderSyncRequested)) { _ in
            Task { await library.synchronize(settings: settings) }
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await library.synchronize(settings: settings) }
        }
        .confirmationDialog(
            "从书架删除《\(bookToDelete?.title ?? "")》？",
            isPresented: Binding(
                get: { bookToDelete != nil },
                set: { if !$0 { bookToDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("删除电子书和阅读进度", role: .destructive) {
                guard let book = bookToDelete else { return }
                bookToDelete = nil
                Task { await library.delete(book, settings: settings) }
            }
            Button("取消", role: .cancel) { bookToDelete = nil }
        } message: {
            Text("应用内的电子书副本和阅读进度会从已同步设备移除。你原来下载或保存在“文件”里的 EPUB 不会被删除。")
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("Dawn Reader")
                .font(.system(size: 31, weight: .semibold, design: .serif))
                .foregroundStyle(Palette.ink)
            Text(syncLabel)
                .font(.caption2)
                .foregroundStyle(syncColor)
            Spacer()
            Button {
                showingSettings = true
            } label: {
                Image(systemName: "slider.horizontal.3")
                    .font(.system(size: 17, weight: .medium))
                    .frame(width: 40, height: 40)
            }
            .buttonStyle(.plain)
            .foregroundStyle(Palette.ink)
            Button("导入 EPUB") {
                importing = true
            }
            .buttonStyle(.borderedProminent)
            .tint(Palette.ink)
            .disabled(library.isWorking)
        }
    }

    private var syncLabel: String {
        switch library.syncState {
        case .disconnected: "仅本机"
        case .syncing: "同步中…"
        case .synced: "已同步"
        case .failed: "同步失败"
        }
    }

    private var syncColor: Color {
        switch library.syncState {
        case .synced: Palette.ember
        case .failed: .red.opacity(0.8)
        default: Palette.mutedInk
        }
    }

    private var emptyLibrary: some View {
        VStack(alignment: .leading, spacing: 13) {
            Text("书架是空的")
                .font(.system(size: 22, weight: .medium, design: .serif))
            Text("从“文件”中选择一本或多本 EPUB，也可以直接拖到这里。")
                .foregroundStyle(Palette.mutedInk)
            Button("选择 EPUB") { importing = true }
                .buttonStyle(.bordered)
                .tint(Palette.ember)
        }
        .padding(28)
        .frame(maxWidth: 520, alignment: .leading)
        .background(Palette.paper, in: RoundedRectangle(cornerRadius: 3))
    }

    private var bookList: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 270), spacing: 18)], spacing: 18) {
                ForEach(library.books) { book in
                    bookCard(for: book)
                }
            }
        }
        .overlay {
            if library.isWorking {
                ProgressView()
                    .controlSize(.large)
            }
        }
    }

    private func bookCard(for book: BookRecord) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 0) {
                Button {
                    Task { await library.open(book, settings: settings) }
                } label: {
                    VStack(alignment: .leading, spacing: 16) {
                        HStack(spacing: 8) {
                            Text("EPUB")
                                .font(.caption2.weight(.semibold))
                                .tracking(1.2)
                            Spacer(minLength: 8)
                            Text("\(Int(book.progress * 100))%")
                                .font(.caption.monospacedDigit())
                                .fixedSize(horizontal: true, vertical: false)
                        }
                        .foregroundStyle(Palette.mutedInk)
                        Text(book.title)
                            .font(.system(.title3, design: .serif).weight(.medium))
                            .foregroundStyle(Palette.ink)
                            .multilineTextAlignment(.leading)
                            .lineLimit(3)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        ProgressView(value: book.progress)
                            .tint(Palette.ember)
                    }
                    .padding(.leading, 22)
                    .padding(.trailing, 12)
                    .padding(.vertical, 18)
                    .frame(maxWidth: .infinity, minHeight: 156, alignment: .topLeading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("打开《\(book.title)》")
                .accessibilityValue("阅读进度 \(Int(book.progress * 100))%")

                VStack(spacing: 0) {
                    Button(role: .destructive) {
                        bookToDelete = book
                    } label: {
                        Image(systemName: "trash")
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Palette.mutedInk)
                    .accessibilityLabel("从书架删除《\(book.title)》")
                    .disabled(library.isWorking)
                    Spacer(minLength: 0)
                }
                .frame(width: 54)
                .frame(minHeight: 156, alignment: .top)
                .padding(.top, 8)
            }

            Divider()
                .overlay(Palette.line)

            assistantModeControl(for: book)
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
        }
        .frame(maxWidth: .infinity, minHeight: 214, alignment: .topLeading)
        .background(Palette.paper, in: RoundedRectangle(cornerRadius: 3))
        .clipShape(RoundedRectangle(cornerRadius: 3))
        .accessibilityElement(children: .contain)
    }

    private func assistantModeControl(for book: BookRecord) -> some View {
        Menu {
            Picker(
                "划线后的动作",
                selection: Binding(
                    get: { book.effectiveAssistantMode },
                    set: { library.setAssistantMode($0, for: book) }
                )
            ) {
                Label("英文改写", systemImage: "textformat")
                    .tag(BookAssistantMode.rewrite)
                Label("AI 提问", systemImage: "bubble.left.and.bubble.right")
                    .tag(BookAssistantMode.ask)
            }
        } label: {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 9) {
                    assistantModeBadge(for: book)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("划线后")
                            .font(.system(size: 8, design: .monospaced))
                            .tracking(0.6)
                            .foregroundStyle(Palette.mutedInk.opacity(0.74))
                        Text(book.effectiveAssistantMode.title)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Palette.ink)
                    }
                    assistantModeChevron
                }
                HStack(spacing: 7) {
                    assistantModeBadge(for: book)
                    Text(book.effectiveAssistantMode.title)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Palette.ink)
                        .lineLimit(1)
                    assistantModeChevron
                }
                HStack(spacing: 5) {
                    assistantModeBadge(for: book)
                    assistantModeChevron
                }
            }
            .frame(minHeight: 44)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("划线后的动作：\(book.effectiveAssistantMode.title)")
        .accessibilityHint("打开菜单以选择划线后的动作")
    }

    private func assistantModeBadge(for book: BookRecord) -> some View {
        Text(book.effectiveAssistantMode == .rewrite ? "Aa" : "?")
            .font(.system(size: 11, weight: .semibold, design: .serif))
            .foregroundStyle(book.effectiveAssistantMode == .ask ? Palette.ember : Palette.mutedInk)
            .frame(width: 30, height: 30)
            .background(Palette.paper.opacity(0.72))
            .clipShape(.rect(cornerRadius: 15, style: .continuous))
            .overlay {
                UnevenRoundedRectangle(
                    topLeadingRadius: 15,
                    bottomLeadingRadius: 4,
                    bottomTrailingRadius: 15,
                    topTrailingRadius: 15
                )
                .stroke(book.effectiveAssistantMode == .ask ? Palette.ember.opacity(0.58) : Palette.line)
            }
    }

    private var assistantModeChevron: some View {
        Image(systemName: "chevron.up.chevron.down")
            .font(.system(size: 8, weight: .medium))
            .foregroundStyle(Palette.mutedInk.opacity(0.72))
    }
}
