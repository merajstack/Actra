/**
 * Actra Browser - History Store using electron-store
 */
const Store = require('electron-store');
const store = new Store();

class HistoryStore {
  static getHistory() {
    return store.get('browser_history', []);
  }

  static addHistoryItem(item) {
    const history = this.getHistory();
    history.unshift({ id: `h-${Date.now()}`, ...item, visitTime: Date.now() });
    store.set('browser_history', history.slice(0, 1000)); // keep latest 1000
  }

  static clearHistory() {
    store.set('browser_history', []);
  }
}

module.exports = HistoryStore;
