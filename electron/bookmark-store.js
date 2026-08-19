/**
 * Actra Browser - Bookmark Store using electron-store
 */
const supabase = require('./supabase');

class BookmarkStore {
  static async getBookmarks() {
    const { data, error } = await supabase.from('bookmarks').select('*').order('date_added', { ascending: true });
    if (error) {
      console.error('Error fetching bookmarks:', error);
      return [];
    }
    return data || [];
  }

  static async addBookmark(bookmark) {
    const newBookmark = { id: `b-${Date.now()}`, ...bookmark, date_added: Date.now() };
    const { error } = await supabase.from('bookmarks').insert([newBookmark]);
    if (error) console.error('Error adding bookmark:', error);
  }

  static async removeBookmark(id) {
    const { error } = await supabase.from('bookmarks').delete().eq('id', id);
    if (error) console.error('Error removing bookmark:', error);
  }
}

module.exports = BookmarkStore;
