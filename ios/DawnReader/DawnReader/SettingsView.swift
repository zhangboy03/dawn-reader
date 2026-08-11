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
                    appearanceSlider(
                        title: "行距",
                        value: $settings.readerLineHeight,
                        range: 1.25 ... 1.9,
                        step: 0.05,
                        minimumLabel: "紧",
                        maximumLabel: "松"
                    )
                    appearanceSlider(
                        title: "页边距",
                        value: $settings.readerPageMargins,
                        range: 0.7 ... 1.6,
                        step: 0.05,
                        minimumLabel: "窄",
                        maximumLabel: "宽"
                    )
                }
                Section("DeepSeek") {
                    SecureField("API Key", text: $settings.apiKey)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField("模型", text: $settings.model)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
            }
            .navigationTitle("设置")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") {
                        settings.save()
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
