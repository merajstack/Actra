/**
 * Actra AI — Memory Store
 * 
 * Persistent memory for companions using electron-store.
 */
const { default: Store } = require('electron-store');

class MemoryStore {
  constructor() {
    this.store = new Store({ name: 'ai-memory' });
  }

  saveMemory(companionId, key, value) {
    const memoryPath = `companions.${companionId}.memory.${key}`;
    this.store.set(memoryPath, value);
  }

  getMemory(companionId, key) {
    const memoryPath = `companions.${companionId}.memory.${key}`;
    return this.store.get(memoryPath, null);
  }

  getAllMemories(companionId) {
    return this.store.get(`companions.${companionId}.memory`, {});
  }

  deleteMemory(companionId, key) {
    const memoryPath = `companions.${companionId}.memory.${key}`;
    this.store.delete(memoryPath);
  }
}

module.exports = MemoryStore;
