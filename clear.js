const { app } = require('electron');
const { default: Store } = require('electron-store');

app.whenReady().then(() => {
  const stores = ['config', 'google-auth-tokens', 'bookmarks', 'history', 'memory'];
  
  stores.forEach(name => {
    try {
      const store = new Store({ name });
      store.clear();
      console.log(`Cleared store: ${name}`);
    } catch (e) {
      console.log(`Failed to clear store: ${name} - ${e.message}`);
    }
  });
  
  // also clear the default one
  try {
    const store = new Store();
    store.clear();
    console.log(`Cleared default store`);
  } catch(e) {}
  
  console.log("All data cleared.");
  app.quit();
});
