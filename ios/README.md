# Dawn Reader for iPhone and iPad

Native universal reader built with SwiftUI and Readium Swift Toolkit for iOS and iPadOS 17 or later.

## Reading interaction

- iPhone uses a compact, one-handed library and reader chrome. Long-press, adjust the native selection handles, then choose the book's assistant action to open a keyboard-safe bottom sheet.
- iPad keeps the adaptive library grid and selection-adjacent assistant.
- Finger: Readium's normal page navigation on both devices; iPhone long-press also selects text.
- Pencil · Page on iPad: horizontal stroke turns one page.
- Each book chooses what selection does: `英文改写` or `AI 提问`.
- Pencil · Select on iPad: stroke across text creates a DOM selection, then opens the selected book's rewrite or compact chat interaction.
- AI questions keep the selected passage, nearby context, and follow-up history. All native assistance calls Qwen directly with the device Keychain key; pairing only syncs books, progress, and reading settings.
- Pencil double tap on iPad: switches Page and Select modes through `UIPencilInteraction`.
- Reading location is stored after every location change.
- EPUB files can be imported from the system picker, opened from Files, or placed in the app's Files container (`On My iPhone` or `On My iPad` → `Dawn Reader`).

## Build

1. Install the current Xcode from the Mac App Store.
2. Run `xcodegen generate` in `ios/DawnReader`.
3. Open `DawnReader.xcodeproj`, select the DawnReader target, and choose your Personal Team under Signing.
4. Choose an iPhone or iPad simulator/device and run the app.
5. Enter the Alibaba Cloud Model Studio API key in Settings. It is stored in the device Keychain.

No API key or EPUB file is committed to the repository.
