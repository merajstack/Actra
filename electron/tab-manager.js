/**
 * Actra Browser - Tab & BrowserView Manager
 */
const { BrowserView } = require('electron');

class TabManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.tabs = new Map();
    this.activeTabId = null;
  }

  createTab(url = 'https://www.google.com', isIncognito = false) {
    const tabId = `view-${Date.now()}`;
    const view = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: isIncognito ? `persist:incognito-${Date.now()}` : 'default',
      }
    });

    this.mainWindow.addBrowserView(view);
    this.updateViewBounds(view);

    view.webContents.loadURL(url);
    this.tabs.set(tabId, view);
    this.activeTabId = tabId;

    view.webContents.on('did-navigate', (event, navigationUrl) => {
      this.mainWindow.webContents.send('tab-updated', { tabId, url: navigationUrl, title: view.webContents.getTitle() });
    });

    return tabId;
  }

  closeTab(tabId) {
    const view = this.tabs.get(tabId);
    if (view) {
      this.mainWindow.removeBrowserView(view);
      view.webContents.destroy();
      this.tabs.delete(tabId);
    }
  }

  navigateTab(tabId, url) {
    const view = this.tabs.get(tabId);
    if (view) {
      view.webContents.loadURL(url);
    }
  }

  updateViewBounds(view) {
    const bounds = this.mainWindow.getBounds();
    // Leave room for chrome UI (traffic lights, tab strip, toolbar) approx 95px
    view.setBounds({ x: 0, y: 98, width: bounds.width, height: bounds.height - 98 });
    view.setAutoResize({ width: true, height: true });
  }
}

module.exports = TabManager;
