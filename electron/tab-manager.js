/**
 * Actra Browser - Tab & BrowserView Manager
 * Chrome-style tab architecture: each tab owns its own BrowserView with independent
 * page state, navigation history, rendering context, and lifecycle.
 */
const { BrowserView, Menu, clipboard } = require('electron');

class TabManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.tabs = new Map();          // tabId -> BrowserView
    this.tabOrder = [];             // ordered array of tabIds for visual ordering
    this.activeTabId = null;
    this.closedTabHistory = [];     // stack of { url, title } for reopen
    this.maxClosedHistory = 20;

    // Listen for resize to update active view bounds
    this.mainWindow.on('resize', () => {
      if (this.activeTabId) {
        const view = this.tabs.get(this.activeTabId);
        if (view) this.updateViewBounds(view);
      }
    });
  }

  /**
   * Create a new tab with its own independent BrowserView.
   * Each BrowserView gets its own webContents (Chromium renderer process).
   */
  createTab(url = 'https://www.google.com', isIncognito = false) {
    const tabId = `view-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const view = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: isIncognito ? `persist:incognito-${Date.now()}` : 'default',
        sandbox: true,
        safeDialogs: true,
      }
    });

    this.tabs.set(tabId, view);
    this.tabOrder.push(tabId);
    this.setActiveTab(tabId);

    // ── Per-Tab Event Listeners (scoped to this tab's webContents) ──

    view.webContents.on('did-start-loading', () => {
      this._sendToRenderer('tab-loading', { tabId, isLoading: true });
    });

    view.webContents.on('did-stop-loading', () => {
      this._sendToRenderer('tab-loading', { tabId, isLoading: false });
    });

    view.webContents.on('page-title-updated', (event, title) => {
      this._sendToRenderer('tab-title', { tabId, title });
    });

    view.webContents.on('page-favicon-updated', (event, favicons) => {
      if (favicons.length > 0) {
        this._sendToRenderer('tab-favicon', { tabId, favicon: favicons[0] });
      }
    });

    // Navigation events — update only THIS tab's state in the renderer
    view.webContents.on('did-navigate', (event, navigationUrl) => {
      this._sendTabState(tabId, view, navigationUrl);
    });

    view.webContents.on('did-navigate-in-page', (event, navigationUrl) => {
      this._sendTabState(tabId, view, navigationUrl);
    });

    // Handle load failures per-tab (show error only in this tab)
    view.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      // Ignore aborted loads (user navigated away quickly)
      if (errorCode === -3) return;
      console.warn(`[TabManager] Tab ${tabId} failed to load ${validatedURL}: ${errorDescription} (${errorCode})`);
      this._sendToRenderer('tab-loading', { tabId, isLoading: false });
    });

    // Handle renderer crashes per-tab
    view.webContents.on('render-process-gone', (event, details) => {
      console.error(`[TabManager] Tab ${tabId} renderer crashed:`, details.reason);
      this._sendToRenderer('tab-crashed', { tabId, reason: details.reason });
    });

    // Chrome-style: target="_blank" links open in a NEW tab (not same tab)
    view.webContents.setWindowOpenHandler((details) => {
      const newTabId = this.createTab(details.url, isIncognito);
      this._sendToRenderer('new-tab-created', { tabId: newTabId, url: details.url, isIncognito });
      return { action: 'deny' }; // Prevent default Electron window, we manage tabs ourselves
    });

    // Native Context Menu (Right-click)
    view.webContents.on('context-menu', (event, params) => {
      const template = [];

      // Link context
      if (params.linkURL) {
        template.push({
          label: 'Open link in new tab',
          click: () => {
            const newTabId = this.createTab(params.linkURL, isIncognito);
            this._sendToRenderer('new-tab-created', { tabId: newTabId, url: params.linkURL, isIncognito });
          }
        });
        template.push({
          label: 'Copy link address',
          click: () => { clipboard.writeText(params.linkURL); }
        });
        template.push({ type: 'separator' });
      }

      // Media context
      if (params.hasImageContents && params.srcURL) {
        template.push({
          label: 'Save image as...',
          click: () => { view.webContents.downloadURL(params.srcURL); }
        });
        template.push({
          label: 'Copy image address',
          click: () => { clipboard.writeText(params.srcURL); }
        });
        template.push({ type: 'separator' });
      }

      // Editable text context
      if (params.isEditable) {
        template.push({ role: 'undo' });
        template.push({ role: 'redo' });
        template.push({ type: 'separator' });
        template.push({ role: 'cut' });
        template.push({ role: 'copy' });
        template.push({ role: 'paste' });
        template.push({ role: 'selectAll' });
      } else if (params.selectionText) {
        // Just text selected
        template.push({ role: 'copy' });
        template.push({ type: 'separator' });
        template.push({
          label: 'Search Google for "' + (params.selectionText.length > 20 ? params.selectionText.substring(0, 20) + '...' : params.selectionText) + '"',
          click: () => {
            const url = `https://www.google.com/search?q=${encodeURIComponent(params.selectionText)}`;
            const newTabId = this.createTab(url, isIncognito);
            this._sendToRenderer('new-tab-created', { tabId: newTabId, url, isIncognito });
          }
        });
      } else if (!params.linkURL && !params.hasImageContents) {
        // General page context
        template.push({
          label: 'Back',
          enabled: view.webContents.canGoBack(),
          click: () => view.webContents.goBack()
        });
        template.push({
          label: 'Forward',
          enabled: view.webContents.canGoForward(),
          click: () => view.webContents.goForward()
        });
        template.push({
          label: 'Reload',
          click: () => view.webContents.reload()
        });
        template.push({ type: 'separator' });
        template.push({
          label: 'Save page as...',
          click: () => { view.webContents.downloadURL(view.webContents.getURL()); }
        });
      }

      if (template.length > 0) {
        const menu = Menu.buildFromTemplate(template);
        menu.popup();
      }
    });

    // Load the URL if it's not the internal new-tab page
    if (url && url !== 'chrome://newtab') {
      view.webContents.loadURL(url);
    }

    return tabId;
  }

  /**
   * Close a tab: full lifecycle cleanup.
   * Stop page → remove from window → release listeners → destroy webContents → delete.
   */
  closeTab(tabId) {
    const view = this.tabs.get(tabId);
    if (!view) return;

    // Save to closed-tab history for "Reopen Closed Tab"
    try {
      const url = view.webContents.getURL();
      const title = view.webContents.getTitle();
      if (url && url !== 'about:blank') {
        this.closedTabHistory.push({ url, title });
        if (this.closedTabHistory.length > this.maxClosedHistory) {
          this.closedTabHistory.shift();
        }
      }
    } catch (e) {
      // webContents may already be gone
    }

    // Detach from window
    try {
      this.mainWindow.removeBrowserView(view);
    } catch (e) { /* already removed */ }

    // Stop loading, remove all listeners, destroy webContents
    try {
      view.webContents.stop();
      view.webContents.removeAllListeners();
      view.webContents.close();
    } catch (e) {
      // webContents may already be destroyed
    }

    // Remove from tracking
    this.tabs.delete(tabId);
    this.tabOrder = this.tabOrder.filter(id => id !== tabId);
  }

  /**
   * Reopen the last closed tab. Creates a new tab with the saved URL.
   */
  reopenClosedTab() {
    if (this.closedTabHistory.length === 0) return null;
    const { url } = this.closedTabHistory.pop();
    const tabId = this.createTab(url, false);
    this._sendToRenderer('new-tab-created', { tabId, url, isIncognito: false });
    return { tabId, url };
  }

  /**
   * Duplicate a tab: creates a new independent tab with the same URL.
   * The new tab gets its own BrowserView, own page state, own lifecycle.
   */
  duplicateTab(tabId) {
    const view = this.tabs.get(tabId);
    if (!view) return null;
    const url = view.webContents.getURL() || 'chrome://newtab';
    const isIncognito = view.webPreferences?.partition?.startsWith('persist:incognito') || false;
    const newTabId = this.createTab(url, isIncognito);
    this._sendToRenderer('new-tab-created', { tabId: newTabId, url, isIncognito });
    return newTabId;
  }

  /**
   * Navigate a specific tab to a URL. Only affects THIS tab.
   */
  navigateTab(tabId, url) {
    const view = this.tabs.get(tabId);
    if (!view) return;

    if (url === 'chrome://newtab') {
      // Hide native view, let React render the new-tab page
      this.mainWindow.removeBrowserView(view);
      view.webContents.loadURL('about:blank');
    } else {
      this.mainWindow.addBrowserView(view);
      this.updateViewBounds(view);
      view.webContents.loadURL(url);
    }
  }

  /**
   * Switch active tab. Hides old BrowserView, shows new one.
   * Does NOT reload pages — just changes visibility/activation.
   */
  setActiveTab(tabId) {
    // Hide current active view
    if (this.activeTabId && this.activeTabId !== tabId) {
      const currentView = this.tabs.get(this.activeTabId);
      if (currentView) {
        try { this.mainWindow.removeBrowserView(currentView); } catch (e) {}
      }
    }

    this.activeTabId = tabId;
    const newView = this.tabs.get(tabId);

    if (newView) {
      const url = newView.webContents.getURL();
      // Only show native BrowserView if we have real content (not about:blank / new tab)
      if (url && !url.includes('about:blank')) {
        this.mainWindow.addBrowserView(newView);
        this.updateViewBounds(newView);
      }

      // Push current state to renderer (scoped to THIS tab only)
      this._sendTabState(tabId, newView);
    }
  }

  /**
   * Show/hide a tab's BrowserView without changing the active tab.
   */
  setVisibility(tabId, visible) {
    const view = this.tabs.get(tabId);
    if (!view || this.activeTabId !== tabId) return;

    if (visible) {
      this.mainWindow.addBrowserView(view);
      this.updateViewBounds(view);
    } else {
      try { this.mainWindow.removeBrowserView(view); } catch (e) {}
    }
  }

  /**
   * Per-tab navigation: Back. Only affects the specified tab.
   */
  goBack(tabId) {
    const view = this.tabs.get(tabId);
    if (!view) return;
    const nav = view.webContents.navigationHistory;
    if (nav ? nav.canGoBack() : view.webContents.canGoBack()) {
      nav ? nav.goBack() : view.webContents.goBack();
    }
  }

  /**
   * Per-tab navigation: Forward. Only affects the specified tab.
   */
  goForward(tabId) {
    const view = this.tabs.get(tabId);
    if (!view) return;
    const nav = view.webContents.navigationHistory;
    if (nav ? nav.canGoForward() : view.webContents.canGoForward()) {
      nav ? nav.goForward() : view.webContents.goForward();
    }
  }

  /**
   * Per-tab reload. Only affects the specified tab.
   */
  reloadTab(tabId) {
    const view = this.tabs.get(tabId);
    if (view) view.webContents.reload();
  }

  /**
   * Captures a screenshot of the specified tab.
   * Returns a base64 encoded PNG string.
   */
  async captureScreenshot(tabId) {
    const view = this.tabs.get(tabId);
    if (!view) return null;
    try {
      const image = await view.webContents.capturePage();
      return image.toDataURL(); // e.g., "data:image/png;base64,..."
    } catch (e) {
      console.error('[TabManager] Screenshot capture failed:', e);
      return null;
    }
  }

  /**
   * Per-tab reload ignoring cache.
   */
  reloadIgnoringCache(tabId) {
    const view = this.tabs.get(tabId);
    if (view) view.webContents.reloadIgnoringCache();
  }

  /**
   * Per-tab stop loading. Only affects the specified tab.
   */
  stop(tabId) {
    const view = this.tabs.get(tabId);
    if (view) view.webContents.stop();
  }

  /**
   * Per-tab zoom. Only affects the specified tab.
   */
  setZoom(tabId, factor) {
    const view = this.tabs.get(tabId);
    if (view) view.webContents.setZoomFactor(factor);
  }

  zoomIn(tabId) {
    const view = this.tabs.get(tabId);
    if (view) view.webContents.setZoomLevel(view.webContents.getZoomLevel() + 1);
  }

  zoomOut(tabId) {
    const view = this.tabs.get(tabId);
    if (view) view.webContents.setZoomLevel(view.webContents.getZoomLevel() - 1);
  }

  resetZoom(tabId) {
    const view = this.tabs.get(tabId);
    if (view) view.webContents.setZoomLevel(0);
  }

  /**
   * Print the active page.
   */
  print(tabId) {
    const view = this.tabs.get(tabId);
    if (view) view.webContents.print();
  }

  /**
   * Save the active page.
   */
  savePage(tabId) {
    const view = this.tabs.get(tabId);
    if (view) view.webContents.downloadURL(view.webContents.getURL());
  }

  /**
   * Open Developer Tools for the active page.
   */
  openDevTools(tabId, options = { mode: 'detach' }) {
    const view = this.tabs.get(tabId);
    if (view) view.webContents.openDevTools(options);
  }

  /**
   * Per-tab find-in-page.
   */
  findInPage(tabId, text) {
    const view = this.tabs.get(tabId);
    if (view) view.webContents.findInPage(text);
  }

  findNext(tabId, text) {
    const view = this.tabs.get(tabId);
    if (view) view.webContents.findInPage(text, { forward: true, findNext: true });
  }

  findPrev(tabId, text) {
    const view = this.tabs.get(tabId);
    if (view) view.webContents.findInPage(text, { forward: false, findNext: true });
  }

  /**
   * Per-tab stop find.
   */
  stopFindInPage(tabId) {
    const view = this.tabs.get(tabId);
    if (view) view.webContents.stopFindInPage('clearSelection');
  }

  /**
   * Move a tab to a new position in the tab order (for drag-and-drop reordering).
   * This changes ONLY the visual order — never destroys or recreates the page.
   */
  moveTab(tabId, newIndex) {
    const currentIndex = this.tabOrder.indexOf(tabId);
    if (currentIndex === -1) return;
    this.tabOrder.splice(currentIndex, 1);
    this.tabOrder.splice(newIndex, 0, tabId);
  }

  /**
   * Calculate and set BrowserView bounds relative to the window content area.
   */
  updateViewBounds(view, extraOffset = 0) {
    const [width, height] = this.mainWindow.getContentSize();
    const UI_CHROME = (this.uiChromeHeight !== undefined) ? this.uiChromeHeight : 88;
    const yOffset = UI_CHROME + extraOffset;
    const SIDEBAR_WIDTH = (this.sidebarWidth !== undefined) ? this.sidebarWidth : 0;
    const RIGHT_OVERLAY_WIDTH = (this.rightOverlayWidth !== undefined) ? this.rightOverlayWidth : 0;

    view.setBounds({
      x: SIDEBAR_WIDTH,
      y: yOffset,
      width: Math.max(width - SIDEBAR_WIDTH - RIGHT_OVERLAY_WIDTH, 100),
      height: Math.max(height - yOffset, 100)
    });
    view.setAutoResize({ width: true, height: true });
  }

  // ── Private Helpers ──

  /**
   * Safely send a message to the renderer process.
   */
  _sendToRenderer(channel, data) {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(channel, data);
      }
    } catch (e) {
      // Window may have been closed
    }
  }

  /**
   * Send the full current state of a specific tab to the renderer.
   * Always scoped to tabId — never leaks into other tabs.
   */
  _sendTabState(tabId, view, url) {
    const nav = view.webContents.navigationHistory;
    const currentUrl = url || view.webContents.getURL();

    // If the BrowserView hasn't fully loaded its initial URL yet, it returns an empty string.
    // We must ignore empty strings to prevent overwriting React's optimistic 'chrome://newtab' state.
    if (!currentUrl) return;

    this._sendToRenderer('tab-updated', {
      tabId,
      url: currentUrl,
      title: view.webContents.getTitle(),
      canGoBack: nav ? nav.canGoBack() : view.webContents.canGoBack(),
      canGoForward: nav ? nav.canGoForward() : view.webContents.canGoForward()
    });
  }
}

module.exports = TabManager;
