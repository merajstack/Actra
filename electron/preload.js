/**
 * Actra Browser - Electron Preload Script
 * Exposes a secure contextBridge API to the renderer UI.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ─── Tab Operations ──────────────────────────────────────────────────────
  createTab:       (url, isIncognito) => ipcRenderer.invoke('tab:create', url, isIncognito),
  closeTab:        (tabId) => ipcRenderer.invoke('tab:close', tabId),
  navigateTab:     (tabId, url) => ipcRenderer.invoke('tab:navigate', tabId, url),
  setActiveTab:    (tabId) => ipcRenderer.invoke('tab:setActive', tabId),
  goBack:          (tabId) => ipcRenderer.invoke('tab:goBack', tabId),
  goForward:       (tabId) => ipcRenderer.invoke('tab:goForward', tabId),
  reload:          (tabId) => ipcRenderer.invoke('tab:reload', tabId),
  stop:            (tabId) => ipcRenderer.invoke('tab:stop', tabId),
  setZoom:         (tabId, factor) => ipcRenderer.invoke('tab:setZoom', tabId, factor),
  findInPage:      (tabId, text) => ipcRenderer.invoke('tab:find', tabId, text),
  stopFind:        (tabId) => ipcRenderer.invoke('tab:stopFind', tabId),
  stopFindInPage:  (tabId) => ipcRenderer.invoke('tab:stopFind', tabId),
  setVisibility:   (tabId, visible) => ipcRenderer.invoke('tab:setVisibility', tabId, visible),
  setUIChromeHeight: (height) => ipcRenderer.invoke('tab:setUIChromeHeight', height),
  setSidebarWidth: (width) => ipcRenderer.invoke('tab:setSidebarWidth', width),
  reopenClosedTab: () => ipcRenderer.invoke('tab:reopenClosed'),
  duplicateTab:    (tabId) => ipcRenderer.invoke('tab:duplicate', tabId),
  isFullscreen:    () => ipcRenderer.invoke('window:isFullscreen'),
  requestMicAccess:() => ipcRenderer.invoke('window:requestMicAccess'),

  // ─── Tab Events ──────────────────────────────────────────────────────────
  onTabUpdated: (cb) => {
    ipcRenderer.removeAllListeners('tab-updated');
    ipcRenderer.on('tab-updated', (_, data) => cb(data));
  },
  onTabLoading: (cb) => {
    ipcRenderer.removeAllListeners('tab-loading');
    ipcRenderer.on('tab-loading', (_, data) => cb(data));
  },
  onTabTitle: (cb) => {
    ipcRenderer.removeAllListeners('tab-title');
    ipcRenderer.on('tab-title', (_, data) => cb(data));
  },
  onTabFavicon: (cb) => {
    ipcRenderer.removeAllListeners('tab-favicon');
    ipcRenderer.on('tab-favicon', (_, data) => cb(data));
  },
  onNewTabCreated: (cb) => {
    ipcRenderer.removeAllListeners('new-tab-created');
    ipcRenderer.on('new-tab-created', (_, data) => cb(data));
  },
  onTabCrashed: (cb) => {
    ipcRenderer.removeAllListeners('tab-crashed');
    ipcRenderer.on('tab-crashed', (_, data) => cb(data));
  },
  onAnimateAddressBarNavigation: (cb) => {
    ipcRenderer.removeAllListeners('animate-address-bar-navigation');
    ipcRenderer.on('animate-address-bar-navigation', (_, data) => cb(data));
  },
  onVoiceStateUpdate: (cb) => {
    ipcRenderer.removeAllListeners('voice-state-update');
    ipcRenderer.on('voice-state-update', (_, data) => cb(data));
  },
  onDownloadProgress: (cb) => {
    ipcRenderer.removeAllListeners('download-progress');
    ipcRenderer.on('download-progress', (_, data) => cb(data));
  },
  onDownloadComplete: (cb) => {
    ipcRenderer.removeAllListeners('download-complete');
    ipcRenderer.on('download-complete', (_, data) => cb(data));
  },

  // ─── Menu / Keyboard Shortcut IPC ────────────────────────────────────────
  onMenuNewTab:             (cb) => { ipcRenderer.removeAllListeners('menu:new-tab');              ipcRenderer.on('menu:new-tab', () => cb()); },
  onMenuNewIncognitoTab:    (cb) => { ipcRenderer.removeAllListeners('menu:new-incognito-tab');    ipcRenderer.on('menu:new-incognito-tab', () => cb()); },
  onMenuToggleVoice:        (cb) => { ipcRenderer.removeAllListeners('menu:toggle-voice');         ipcRenderer.on('menu:toggle-voice', () => cb()); },
  onMenuCloseTab:           (cb) => { ipcRenderer.removeAllListeners('menu:close-tab');            ipcRenderer.on('menu:close-tab', () => cb()); },
  onMenuReopenTab:          (cb) => { ipcRenderer.removeAllListeners('menu:reopen-tab');           ipcRenderer.on('menu:reopen-tab', () => cb()); },
  onMenuNextTab:            (cb) => { ipcRenderer.removeAllListeners('menu:next-tab');             ipcRenderer.on('menu:next-tab', () => cb()); },
  onMenuPrevTab:            (cb) => { ipcRenderer.removeAllListeners('menu:prev-tab');             ipcRenderer.on('menu:prev-tab', () => cb()); },
  onMenuSelectTab:          (cb) => { ipcRenderer.removeAllListeners('menu:select-tab');           ipcRenderer.on('menu:select-tab', (_, idx) => cb(idx)); },
  onMenuSelectLastTab:      (cb) => { ipcRenderer.removeAllListeners('menu:select-last-tab');      ipcRenderer.on('menu:select-last-tab', () => cb()); },
  onMenuFocusUrl:           (cb) => { ipcRenderer.removeAllListeners('menu:focus-url');            ipcRenderer.on('menu:focus-url', () => cb()); },
  onMenuCommandBar:         (cb) => { ipcRenderer.removeAllListeners('menu:command-bar');          ipcRenderer.on('menu:command-bar', () => cb()); },
  onMenuBookmark:           (cb) => { ipcRenderer.removeAllListeners('menu:bookmark');             ipcRenderer.on('menu:bookmark', () => cb()); },
  onMenuBookmarkAll:        (cb) => { ipcRenderer.removeAllListeners('menu:bookmark-all');         ipcRenderer.on('menu:bookmark-all', () => cb()); },
  onMenuToggleBookmarksBar: (cb) => { ipcRenderer.removeAllListeners('menu:toggle-bookmarks-bar'); ipcRenderer.on('menu:toggle-bookmarks-bar', () => cb()); },
  onMenuFind:               (cb) => { ipcRenderer.removeAllListeners('menu:find');                 ipcRenderer.on('menu:find', () => cb()); },
  onMenuFindNext:           (cb) => { ipcRenderer.removeAllListeners('menu:find-next');            ipcRenderer.on('menu:find-next', () => cb()); },
  onMenuFindPrev:           (cb) => { ipcRenderer.removeAllListeners('menu:find-prev');            ipcRenderer.on('menu:find-prev', () => cb()); },
  onMenuHistory:            (cb) => { ipcRenderer.removeAllListeners('menu:history');              ipcRenderer.on('menu:history', () => cb()); },
  onMenuDownloads:          (cb) => { ipcRenderer.removeAllListeners('menu:downloads');            ipcRenderer.on('menu:downloads', () => cb()); },
  onMenuToggleDevtools:     (cb) => { ipcRenderer.removeAllListeners('menu:toggle-devtools');      ipcRenderer.on('menu:toggle-devtools', () => cb()); },

  // ─── AI Platform APIs ─────────────────────────────────────────────────────
  sendChatMessage: (command, activeTabId) => ipcRenderer.invoke('ai:send-chat-message', command, activeTabId),
  getChatHistory:  () => ipcRenderer.invoke('ai:get-chat-history'),
  clearChat:       () => ipcRenderer.invoke('ai:clear-chat'),
  cancelTask:      (taskId) => ipcRenderer.invoke('ai:cancel-task', taskId),

  /** Approve an action */
  resolveApproval: (approvalId, approved) => ipcRenderer.invoke('ai:resolve-approval', approvalId, approved),

  /** Edit an action's args and approve it */
  editApproval: (approvalId, newArgs) => ipcRenderer.invoke('ai:edit-approval', approvalId, newArgs),

  getCompanions: () => ipcRenderer.invoke('ai:get-companions'),
  getTasks:      () => ipcRenderer.invoke('ai:get-tasks'),

  /** Get audit log entries */
  getAILogs: (limit) => ipcRenderer.invoke('ai:get-logs', limit),

  // ─── AI Event Listeners ───────────────────────────────────────────────────
  onAIChatUpdated: (cb) => {
    ipcRenderer.removeAllListeners('ai:chat-updated');
    ipcRenderer.on('ai:chat-updated', (_, data) => cb(data));
  },
  onAIRequireApproval: (cb) => {
    ipcRenderer.removeAllListeners('ai:require-approval');
    ipcRenderer.on('ai:require-approval', (_, data) => cb(data));
  },
  onAITaskUpdate: (cb) => {
    ipcRenderer.removeAllListeners('ai:task-update');
    ipcRenderer.on('ai:task-update', (_, data) => cb(data));
  },
  onAIOpenSidePanel: (cb) => {
    ipcRenderer.removeAllListeners('ai:open-side-panel');
    ipcRenderer.on('ai:open-side-panel', () => cb());
  },

  // ─── Google Auth ──────────────────────────────────────────────────────────
  getGoogleAuthStatus: () => ipcRenderer.invoke('auth:google-status'),
  signInWithGoogle:    () => ipcRenderer.invoke('auth:google-signin'),
  signOutFromGoogle:   () => ipcRenderer.invoke('auth:google-signout'),

  // ─── Voice UI ─────────────────────────────────────────────────────────────

  initWhisper: () => ipcRenderer.invoke('voice:init-whisper'),
  transcribeAudio: (audioBuffer) => ipcRenderer.invoke('voice:transcribe', audioBuffer),
  hideVoiceWindow: () => ipcRenderer.invoke('voice:hide'),
  executeVoiceCommand: (command) => ipcRenderer.invoke('voice:execute-command', command),
  onVoiceStateUpdate: (cb) => {
    ipcRenderer.removeAllListeners('voice-state-update');
    ipcRenderer.on('voice-state-update', (_, data) => cb(data));
  },
  onVoiceShortcutDown: (cb) => {
    ipcRenderer.removeAllListeners('voice-shortcut-down');
    ipcRenderer.on('voice-shortcut-down', () => cb());
  },
  onVoiceShortcutUp: (cb) => {
    ipcRenderer.removeAllListeners('voice-shortcut-up');
    ipcRenderer.on('voice-shortcut-up', () => cb());
  },
  onVoiceStopRecording: (cb) => {
    ipcRenderer.removeAllListeners('voice-stop-recording');
    ipcRenderer.on('voice-stop-recording', () => cb());
  }
});
