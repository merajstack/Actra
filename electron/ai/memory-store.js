/**
 * Actra AI — Memory Store
 * 
 * Persistent memory for companions using electron-store.
 */
const supabase = require('../supabase');

class MemoryStore {
  async saveMemory(companionId, key, value) {
    const { error } = await supabase.from('companion_memory').upsert({ companion_id: companionId, key, value });
    if (error) console.error('Error saving memory:', error);
  }

  async getMemory(companionId, key) {
    const { data } = await supabase.from('companion_memory').select('value').eq('companion_id', companionId).eq('key', key).single();
    return data?.value || null;
  }

  async getAllMemories(companionId) {
    const { data } = await supabase.from('companion_memory').select('key, value').eq('companion_id', companionId);
    if (!data) return {};
    return data.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
  }

  async deleteMemory(companionId, key) {
    const { error } = await supabase.from('companion_memory').delete().eq('companion_id', companionId).eq('key', key);
    if (error) console.error('Error deleting memory:', error);
  }
}

module.exports = MemoryStore;
