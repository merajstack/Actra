/**
 * Actra Browser - Bookmark Store using electron-store
 */
const { default: Store } = require('electron-store');
const store = new Store();

class BookmarkStore {
  static getBookmarks() {
    return store.get('browser_bookmarks', [
      { id: 'b1', title: 'GitHub', url: 'https://github.com', folderId: '1', dateAdded: Date.now() },
      { id: 'b2', title: 'Hacker News', url: 'https://news.ycombinator.com', folderId: '1', dateAdded: Date.now() }
    ]);
  }

  static addBookmark(bookmark) {
    const bookmarks = this.getBookmarks();
    bookmarks.push({ id: `b-${Date.now()}`, ...bookmark, dateAdded: Date.now() });
    store.set('browser_bookmarks', bookmarks);
  }

  static removeBookmark(id) {
    const bookmarks = this.getBookmarks().filter(b => b.id !== id);
    store.set('browser_bookmarks', bookmarks);
  }
}

module.exports = BookmarkStore;
