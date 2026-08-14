/**
 * Actra Browser - Electron Preload Script
 * Exposes a secure contextBridge API to the renderer UI.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  createTab: (url, isIncognito) => ipcRenderer.invoke('tab:create', url, isIncognito),
  closeTab: (tabId) => ipcRenderer.invoke('tab:close', tabId),
  navigateTab: (tabId, url) => ipcRenderer.invoke('tab:navigate', tabId, url),
  onTabUpdated: (callback) => ipcRenderer.on('tab-updated', (event, data) => callback(data)),
});
