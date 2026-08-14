# Dawn Reader for iPad

Native iPad reader built with SwiftUI and Readium Swift Toolkit.

## MVP interaction

- Finger: Readium's normal page navigation.
- Pencil · Page: horizontal stroke turns one page.
- Each book chooses what selection does: `英文改写` or `AI 提问`.
- Pencil · Select: stroke across text creates a DOM selection, then opens the selected book's rewrite or compact chat interaction.
- AI questions keep the selected passage, nearby context, and follow-up history. A paired device can use the hosted search-backed service; an unpaired device falls back to its local DeepSeek key without claiming live search.
- Pencil double tap: switches Page and Select modes through `UIPencilInteraction`.
- Reading location is stored after every location change.
- EPUB files can be imported from the system picker, opened from Files, or placed in `On My iPad/Dawn Reader`.

## Build

1. Install the current Xcode from the Mac App Store.
2. Run `xcodegen generate` in `ios/DawnReader`.
3. Open `DawnReader.xcodeproj`, select the DawnReader target, and choose your Personal Team under Signing.
4. Connect the iPad and run the app.
5. Enter the DeepSeek API key in Settings. It is stored in the device Keychain.

No API key or EPUB file is committed to the repository.
