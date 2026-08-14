# Actra Desktop Web Browser

Actra is a minimalist, lightning-fast desktop web browser built with **Electron**, powered by Chromium and the V8 JavaScript engine, designed specifically for macOS with a warm beige and orange aesthetic.

---

## Architecture & Tab Management

Unlike web-based iframe wrappers, Actra leverages **Electron's native `BrowserView` API**:
- **Isolated Web Contents**: Every browser tab is backed by an independent native Chromium `BrowserView` instance running in its own process sandbox.
- **V8 JavaScript Engine & Networking**: Full standards-compliant DOM rendering, V8 execution, TLS security, and HTTP stack are provided natively by Chromium.
- **IPC Security**: Renderer UI communicates with the main process via a secure `contextBridge` preload API (`window.electronAPI`), ensuring `contextIsolation: true` and `nodeIntegration: false`.

---

## Quick Start & Installation

```bash
# 1. Install dependencies
npm install

# 2. Run Actra in development mode (Vite + Electron)
npm start
```

---

## Packaging for macOS (`.dmg`)

To build an installable macOS application package using `electron-builder`:

```bash
npm run build-mac
```

---

## Features Implemented

1. **Multi-Tab Browsing**: Tab strip with active states, close buttons, new tab shortcuts (`Cmd+T`, `Cmd+W`).
2. **Omnibox Address Bar**: Smart URL vs. search detection, SSL security indicators, and history/bookmark autocomplete suggestions.
3. **Bookmarks & History**: Persistent stores (`electron-store`), dedicated `chrome://bookmarks` manager with HTML export, and searchable `chrome://history`.
4. **Downloads Manager**: Real-time progress tracking, file size indicators, and "Show in Finder" actions.
5. **Incognito Mode**: Isolated session partition (`persist:incognito`) with distinct dark charcoal & orange theme.
6. **Developer Tools**: Built-in Chromium DevTools panel drawer (`Cmd+Shift+I`).
7. **Page Utilities**: Find-in-page (`Cmd+F`), Reader Mode, Page Source inspector, and per-tab zoom scaling.
