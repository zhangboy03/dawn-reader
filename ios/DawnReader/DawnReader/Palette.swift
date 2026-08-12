import SwiftUI

enum Palette {
    static let ink = Color(red: 0.08, green: 0.12, blue: 0.14)
    static let mutedInk = Color(red: 0.31, green: 0.36, blue: 0.38)
    static let fog = Color(red: 0.91, green: 0.93, blue: 0.92)
    static let paper = Color(red: 0.97, green: 0.97, blue: 0.95)
    static let ember = Color(red: 0.73, green: 0.34, blue: 0.18)
    static let line = Color(red: 0.79, green: 0.82, blue: 0.80)

    static func readerBackgroundHex(for theme: ReaderThemeOption) -> String {
        switch theme {
        case .paper: "#F4F2EA"
        case .sepia: "#E9DFC8"
        case .night: "#1B1D1A"
        }
    }

    static func readerTextHex(for theme: ReaderThemeOption) -> String {
        switch theme {
        case .paper: "#292824"
        case .sepia: "#342E25"
        case .night: "#B8B2A8"
        }
    }

    static func readerBackground(for theme: ReaderThemeOption) -> Color {
        color(hex: readerBackgroundHex(for: theme))
    }

    static func readerText(for theme: ReaderThemeOption) -> Color {
        color(hex: readerTextHex(for: theme))
    }

    static func readerCardBackground(for theme: ReaderThemeOption) -> Color {
        switch theme {
        case .paper: color(hex: "#FBFAF6")
        case .sepia: color(hex: "#F2E7D3")
        case .night: color(hex: "#252722")
        }
    }

    private static func color(hex: String) -> Color {
        let value = Int(hex.dropFirst(), radix: 16) ?? 0
        return Color(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}
