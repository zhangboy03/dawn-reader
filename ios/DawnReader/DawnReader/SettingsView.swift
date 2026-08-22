import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var settings: SettingsStore

    var body: some View {
        NavigationStack {
            Form {
                Section("阅读") {
                    Picker("纸张", selection: $settings.readerTheme) {
                        ForEach(ReaderThemeOption.allCases) { theme in
                            Text(theme.title).tag(theme)
                        }
                    }
                    .pickerStyle(.segmented)

                    appearanceSlider(
                        title: "字号",
                        value: $settings.readerFontSize,
                        range: 0.8 ... 1.4,
                        step: 0.05,
                        minimumLabel: "A",
                        maximumLabel: "A"
                    )
                }
                Section("Qwen") {
                    SecureField("API Key", text: $settings.apiKey)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField("模型", text: $settings.model)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Text("解释和提问会把选中文本、附近上下文与书名发送到阿里云百炼 Qwen。API 密钥只保存在本机钥匙串，不进入 Dawn 设备同步。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                Section("设备同步") {
                    if settings.syncConnectionState == .connected {
                        LabeledContent("状态", value: "已连接")
                        Button("立即同步") {
                            NotificationCenter.default.post(name: .dawnReaderSyncRequested, object: nil)
                        }
                        Button("断开设备同步", role: .destructive) {
                            settings.disconnectSync()
                        }
                    } else {
                        TextField("网站生成的配对码", text: $settings.syncCode)
                            .textInputAutocapitalization(.characters)
                            .autocorrectionDisabled()
                            .font(.system(.body, design: .monospaced))
                        Button(settings.syncConnectionState == .connecting ? "正在连接…" : "连接并同步") {
                            Task { await settings.connectSync() }
                        }
                        .disabled(settings.syncConnectionState == .connecting)
                    }
                    if case let .failed(message) = settings.syncConnectionState {
                        Text(message)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                    Text("配对后同步书籍、阅读位置、字号、纸色和 Apple Pencil 模式。百炼密钥不会上传。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("设置")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") {
                        settings.save()
                        Task { await settings.pushCloudSettings() }
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.large])
    }

    private func appearanceSlider(
        title: String,
        value: Binding<Double>,
        range: ClosedRange<Double>,
        step: Double,
        minimumLabel: String,
        maximumLabel: String
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.subheadline)
            HStack(spacing: 12) {
                Text(minimumLabel)
                    .font(title == "字号" ? .caption : .caption2)
                    .foregroundStyle(.secondary)
                Slider(value: value, in: range, step: step)
                Text(maximumLabel)
                    .font(title == "字号" ? .title3 : .caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
