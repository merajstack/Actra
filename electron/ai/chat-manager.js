/**
 * Actra AI — Chat Manager
 *
 * Stores conversation history and manages active chat sessions.
 */
const supabase = require('../supabase');

class ChatManager {
  constructor() {
    this.activeSessionId = null;
    this._initSession();
  }

  async _initSession() {
    const { data } = await supabase.from('settings').select('value').eq('key', 'activeSessionId').single();
    this.activeSessionId = data?.value || null;
    
    if (!this.activeSessionId || !(await this.getSession(this.activeSessionId))) {
      await this.createSession('New Chat');
    }
  }

  async createSession(title = 'New Chat') {
    const id = 'chat_' + Date.now() + Math.random().toString(36).substr(2, 6);
    const session = {
      id,
      title,
      messages: [],
      updatedAt: Date.now(),
    };
    
    await supabase.from('chat_sessions').insert([{ id, session_data: session }]);
    this.activeSessionId = id;
    await supabase.from('settings').upsert([{ key: 'activeSessionId', value: id }]);
    
    return session;
  }

  async getSession(id) {
    const { data } = await supabase.from('chat_sessions').select('session_data').eq('id', id).single();
    return data?.session_data || null;
  }

  async getActiveSession() {
    let session = null;
    if (this.activeSessionId) {
      session = await this.getSession(this.activeSessionId);
    }
    if (!session) {
      session = await this.createSession();
    }
    return session || { id: 'fallback', title: 'New Chat', messages: [], updatedAt: Date.now() };
  }
  
  async clearActiveSession() {
    await this.createSession('New Chat');
  }

  async addMessage(role, content, extras = {}) {
    const session = await this.getActiveSession();
    if (!session) return null;

    const message = {
      id: 'msg_' + Date.now() + Math.random().toString(36).substr(2, 6),
      role,
      content,
      timestamp: Date.now(),
      ...extras,
    };

    session.messages.push(message);
    session.updatedAt = Date.now();
    
    if (session.messages.length === 1 && role === 'user') {
      session.title = content.substring(0, 30) + (content.length > 30 ? '...' : '');
    }

    await supabase.from('chat_sessions').update({ session_data: session }).eq('id', session.id);
    
    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
      global.mainWindow.webContents.send('ai:chat-updated', session);
    }
    
    return message;
  }
  
  async updateMessage(messageId, updates) {
    const session = await this.getActiveSession();
    if (!session) return false;
    
    const msg = session.messages.find(m => m.id === messageId);
    if (!msg) return false;
    
    Object.assign(msg, updates);
    session.updatedAt = Date.now();
    
    await supabase.from('chat_sessions').update({ session_data: session }).eq('id', session.id);
    
    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
      global.mainWindow.webContents.send('ai:chat-updated', session);
    }
    
    return true;
  }

  async getHistory() {
    const session = await this.getActiveSession();
    return session ? session.messages : [];
  }
}

module.exports = ChatManager;
