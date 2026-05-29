# Desktop icon assets

The Electron shell looks for these at runtime and package time. Until final
branded art lands from design, `src/main/tray.ts` falls back to a tiny embedded
placeholder and electron-builder uses Electron's default app icon.

Required (drop the files in this directory):

- `icon.png` - 512x512 (or 1024) source app icon (Linux + electron-builder source)
- `icon.icns` - macOS app icon (generated from the source)
- `icon.ico` - Windows app icon
- `trayTemplate.png` - 16x16 (+ @2x 32x32) macOS template tray icon (monochrome with alpha)
- `tray.png` - 16x16 tray icon for Windows/Linux

Tracked as a design dependency in `/QUESTIONS.md`. Wire the macOS `.icns` and
Windows `.ico` into `electron-builder.yml` (`mac.icon` / `win.icon`) when
packaging + signing land in Phase 4.
