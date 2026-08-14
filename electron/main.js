/**
 * Actra Browser - Electron Main Process
 * Manages windows, BrowserView / WebContentsView tabs, IPC handlers, downloads, and app lifecycle.
 */
const { app, BrowserWindow, BrowserView, ipcMain, session, Menu, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');
const store = new Store();

const TabManager = require('./tab-manager');
const DownloadManager = require('./download-manager');
const HistoryStore = require('./history-store');
const BookmarkStore = require('./bookmark-store');
const createAppMenu = require('./menu');

let mainWindow = null;
let tabManager = null;
let downloadManager = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#FDFBF7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  tabManager = new TabManager(mainWindow);
  downloadManager = new DownloadManager(mainWindow);

  // Load renderer UI
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  createAppMenu(mainWindow, tabManager);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Event Handlers
ipcMain.handle('tab:create', (event, url, isIncognito) => {
  return tabManager.createTab(url, isIncognito);
});

ipcMain.handle('tab:close', (event, tabId) => {
  return tabManager.closeTab(tabId);
});

ipcMain.handle('tab:navigate', (event, tabId, url) => {
  return tabManager.navigateTab(tabId, url);
});
