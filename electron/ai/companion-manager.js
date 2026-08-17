/**
 * Actra AI — Companion Manager
 * 
 * Manages custom AI personas and their configurations.
 */
const { default: Store } = require('electron-store');

class CompanionManager {
  constructor() {
    this.store = new Store({ name: 'ai-companions' });
    this._initDefaultCompanion();
  }

  _initDefaultCompanion() {
    this.store.set('companions.default', {
      id: 'default',
      name: 'Actra Assistant',
      avatar: 'Sparkles',
      role: 'General Assistant',
      systemInstructions: 'You are Actra, an intelligent browser assistant. Help the user navigate, research, and automate tasks.\n\nCRITICAL INSTRUCTION: If your response contains any URLs or links, you MUST output EACH link inside its own dedicated markdown code block, like this:\n```text\nhttps://example.com\n```',
      model: 'llama-3.1-8b-instant'
    });
    this.store.set('companions.data-analyst', {
      id: 'data-analyst',
      name: 'Data Analyst',
      description: 'Expert at finding and synthesizing Workspace data',
      systemPrompt: 'You are an analytical assistant...',
      model: 'llama-3.1-8b-instant'
    });
  }

  getCompanion(id) {
    return this.store.get(`companions.${id}`);
  }

  getAllCompanions() {
    const companions = this.store.get('companions', {});
    return Object.values(companions);
  }

  createCompanion(data) {
    const id = 'comp_' + Date.now();
    const companion = { id, ...data };
    this.store.set(`companions.${id}`, companion);
    return companion;
  }

  updateCompanion(id, data) {
    const existing = this.getCompanion(id);
    if (!existing) return false;
    this.store.set(`companions.${id}`, { ...existing, ...data });
    return true;
  }
}

module.exports = CompanionManager;
