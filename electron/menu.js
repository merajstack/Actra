/**
 * Actra Browser - macOS Application Menu
 */
const { Menu, app } = require('electron');

function createAppMenu(mainWindow, tabManager) {
  const template = [
    {
      label: 'Actra',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+T',
          click: () => {
            mainWindow.webContents.send('menu:new-tab');
          }
        },
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            // Spawn new window
          }
        },
        {
          label: 'New Incognito Tab',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => {
            mainWindow.webContents.send('menu:new-incognito-tab');
          }
        },
        { type: 'separator' },
        {
          label: 'Toggle Voice Command Bar',
          click: () => {
            mainWindow.webContents.send('menu:toggle-voice');
          }
        },
        { type: 'separator' },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            mainWindow.webContents.send('menu:close-tab');
          }
        },
        {
          label: 'Reopen Closed Tab',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => {
            mainWindow.webContents.send('menu:reopen-tab');
          }
        },
        { type: 'separator' },
        {
          label: 'Save Page As...',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            if (tabManager.activeTabId) tabManager.savePage(tabManager.activeTabId);
          }
        },
        {
          label: 'Print',
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            if (tabManager.activeTabId) tabManager.print(tabManager.activeTabId);
          }
        },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find in Page',
          accelerator: 'CmdOrCtrl+F',
          click: () => {
            mainWindow.webContents.send('menu:find');
          }
        },
        {
          label: 'Find Next',
          accelerator: 'CmdOrCtrl+G',
          click: () => {
            mainWindow.webContents.send('menu:find-next');
          }
        },
        {
          label: 'Find Previous',
          accelerator: 'CmdOrCtrl+Shift+G',
          click: () => {
            mainWindow.webContents.send('menu:find-prev');
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Focus Address Bar',
          accelerator: 'CmdOrCtrl+L',
          click: () => {
            mainWindow.webContents.send('menu:focus-url');
          }
        },
        {
          label: 'AI Command Bar',
          accelerator: 'CmdOrCtrl+K',
          click: () => {
            mainWindow.webContents.send('menu:command-bar');
          }
        },
        { type: 'separator' },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (tabManager.activeTabId) tabManager.reload(tabManager.activeTabId);
          }
        },
        {
          label: 'Force Reload',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            if (tabManager.activeTabId) tabManager.reloadIgnoringCache(tabManager.activeTabId);
          }
        },
        {
          label: 'Stop Loading',
          accelerator: 'Escape',
          click: () => {
            if (tabManager.activeTabId) tabManager.stop(tabManager.activeTabId);
          }
        },
        { type: 'separator' },
        {
          label: 'Actual Size',
          accelerator: 'CmdOrCtrl+0',
          click: () => {
            if (tabManager.activeTabId) tabManager.resetZoom(tabManager.activeTabId);
          }
        },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+Plus',
          click: () => {
            if (tabManager.activeTabId) tabManager.zoomIn(tabManager.activeTabId);
          }
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            if (tabManager.activeTabId) tabManager.zoomOut(tabManager.activeTabId);
          }
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => {
            if (tabManager.activeTabId) tabManager.openDevTools(tabManager.activeTabId, { mode: 'right' });
            mainWindow.webContents.send('menu:toggle-devtools');
          }
        },
        {
          label: 'Developer Console',
          accelerator: 'CmdOrCtrl+Shift+J',
          click: () => {
            if (tabManager.activeTabId) tabManager.openDevTools(tabManager.activeTabId, { mode: 'bottom' });
          }
        },
        {
          label: 'Inspect Element',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => {
            if (tabManager.activeTabId) tabManager.openDevTools(tabManager.activeTabId, { mode: 'detach' });
          }
        }
      ]
    },
    {
      label: 'History',
      submenu: [
        {
          label: 'Show History',
          accelerator: 'CmdOrCtrl+H',
          click: () => {
            mainWindow.webContents.send('menu:history');
          }
        },
        { type: 'separator' },
        {
          label: 'Back',
          accelerator: 'Alt+Left',
          click: () => {
            if (tabManager.activeTabId) tabManager.goBack(tabManager.activeTabId);
          }
        },
        {
          label: 'Forward',
          accelerator: 'Alt+Right',
          click: () => {
            if (tabManager.activeTabId) tabManager.goForward(tabManager.activeTabId);
          }
        }
      ]
    },
    {
      label: 'Bookmarks',
      submenu: [
        {
          label: 'Bookmark This Tab...',
          click: () => {
            mainWindow.webContents.send('menu:bookmark');
          }
        },
        {
          label: 'Bookmark All Tabs...',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => {
            mainWindow.webContents.send('menu:bookmark-all');
          }
        },
        { type: 'separator' },
        {
          label: 'Toggle Bookmarks Bar',
          accelerator: 'CmdOrCtrl+Shift+B',
          click: () => {
            mainWindow.webContents.send('menu:toggle-bookmarks-bar');
          }
        }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        {
          label: 'Show Downloads',
          accelerator: 'CmdOrCtrl+J',
          click: () => {
            mainWindow.webContents.send('menu:downloads');
          }
        },
        { type: 'separator' },
        {
          label: 'Select Next Tab',
          accelerator: 'Ctrl+Tab',
          click: () => {
            mainWindow.webContents.send('menu:next-tab');
          }
        },
        {
          label: 'Select Previous Tab',
          accelerator: 'Ctrl+Shift+Tab',
          click: () => {
            mainWindow.webContents.send('menu:prev-tab');
          }
        },
        { type: 'separator' },
        ...Array.from({ length: 8 }, (_, i) => ({
          label: `Select Tab ${i + 1}`,
          accelerator: `CmdOrCtrl+${i + 1}`,
          click: () => {
            mainWindow.webContents.send('menu:select-tab', i);
          }
        })),
        {
          label: 'Select Last Tab',
          accelerator: 'CmdOrCtrl+9',
          click: () => {
            mainWindow.webContents.send('menu:select-last-tab');
          }
        },
        { type: 'separator' },
        { role: 'front' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

module.exports = createAppMenu;
