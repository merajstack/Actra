/**
 * Actra Browser - Download Manager
 */
const { session } = require('electron');

class DownloadManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.setupDownloads();
  }

  setupDownloads() {
    session.defaultSession.on('will-download', (event, item, webContents) => {
      const fileName = item.getFilename();
      const fileSize = item.getTotalBytes();
      const sourceUrl = item.getURL();

      item.on('updated', (event, state) => {
        if (state === 'progressing') {
          const received = item.getReceivedBytes();
          // Broadcast download progress to UI
          this.mainWindow.webContents.send('download-progress', {
            fileName,
            sourceUrl,
            received,
            total: fileSize,
            percent: (received / fileSize) * 100
          });
        }
      });

      item.once('done', (event, state) => {
        if (state === 'completed') {
          this.mainWindow.webContents.send('download-complete', {
            fileName,
            sourceUrl,
            localPath: item.getSavePath(),
            mimeType: item.getMimeType(),
            total: fileSize,
          });
        }
      });
    });
  }
}

module.exports = DownloadManager;
