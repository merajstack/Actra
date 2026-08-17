const { app } = require('electron'); app.whenReady().then(() => { console.log('isPackaged:', app.isPackaged); app.quit(); });
