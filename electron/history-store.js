/**
 * Actra Browser - History Store using electron-store
 */
const supabase = require('./supabase');

class HistoryStore {
  static async getHistory() {
    const { data, error } = await supabase.from('history').select('*').order('visit_time', { ascending: false }).limit(1000);
    if (error) {
      console.error('Error fetching history:', error);
      return [];
    }
    return data || [];
  }

  static async addHistoryItem(item) {
    const newItem = { id: `h-${Date.now()}`, ...item, visit_time: Date.now() };
    const { error } = await supabase.from('history').insert([newItem]);
    if (error) console.error('Error adding history:', error);
    
    // Cleanup old history (keep latest 1000)
    const { data } = await supabase.from('history').select('id').order('visit_time', { ascending: false }).range(1000, 2000);
    if (data && data.length > 0) {
      const idsToDelete = data.map(d => d.id);
      await supabase.from('history').delete().in('id', idsToDelete);
    }
  }

  static async clearHistory() {
    const { error } = await supabase.from('history').delete().neq('id', '0'); // Hack to delete all
    if (error) console.error('Error clearing history:', error);
  }
}

module.exports = HistoryStore;
