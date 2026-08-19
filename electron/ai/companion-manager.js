/**
 * Actra AI — Companion Manager
 * 
 * Manages custom AI personas and their configurations.
 */
const supabase = require('../supabase');

class CompanionManager {
  constructor() {
    this._initDefaultCompanion();
  }

  async _initDefaultCompanion() {
    const defaultCompanions = [
      {
        id: 'default',
        data: {
          id: 'default',
          name: 'Actra Assistant',
          avatar: 'Sparkles',
          role: 'General Assistant',
          systemInstructions: 'You are Actra, an intelligent browser assistant. Help the user navigate, research, and automate tasks.\n\nCRITICAL INSTRUCTION: If your response contains any URLs or links, you MUST output EACH link inside its own dedicated markdown code block, like this:\n```text\nhttps://example.com\n```',
          model: 'llama-3.1-8b-instant'
        }
      },
      {
        id: 'data-analyst',
        data: {
          id: 'data-analyst',
          name: 'Data Analyst',
          description: 'Expert at finding and synthesizing Workspace data',
          systemPrompt: 'You are an analytical assistant...',
          model: 'llama-3.1-8b-instant'
        }
      }
    ];
    // Upsert default companions
    await supabase.from('companions').upsert(defaultCompanions);
  }

  async getCompanion(id) {
    const { data } = await supabase.from('companions').select('data').eq('id', id).single();
    return data?.data || null;
  }

  async getAllCompanions() {
    const { data } = await supabase.from('companions').select('data');
    return data ? data.map(row => row.data) : [];
  }

  async createCompanion(data) {
    const id = 'comp_' + Date.now();
    const companion = { id, ...data };
    await supabase.from('companions').insert([{ id, data: companion }]);
    return companion;
  }

  async updateCompanion(id, data) {
    const existing = await this.getCompanion(id);
    if (!existing) return false;
    const updated = { ...existing, ...data };
    await supabase.from('companions').update({ data: updated }).eq('id', id);
    return true;
  }
}

module.exports = CompanionManager;
