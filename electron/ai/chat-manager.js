/**
 * Actra AI — Chat Manager
 *
 * Stores conversation history and manages active chat sessions.
 */
const supabase = require('../supabase');

class ChatManager {
  constructor() {
    this.activeSessionId = null;
    this.activeSession = null;
    this._initSession();
  }

  async _initSession() {
    try {
      const { data } = await supabase.from('settings').select('value').eq('key', 'activeSessionId').single();
      this.activeSessionId = data?.value || null;
      
      if (this.activeSessionId) {
        this.activeSession = await this.getSession(this.activeSessionId);
      }
      if (!this.activeSession) {
        await this.createSession('New Chat');
      }
    } catch (e) {
      console.warn('[ChatManager] _initSession failed, using in-memory session:', e.message);
      if (!this.activeSession) {
        await this.createSession('New Chat');
      }
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
    
    this.activeSessionId = id;
    this.activeSession = session;

    // Send to renderer immediately using in-memory session
    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
      try {
        global.mainWindow.webContents.send('ai:chat-updated', session);
      } catch (err) {
        console.warn('[ChatManager] Error broadcasting new session:', err.message);
      }
    }

    // Persist to Supabase asynchronously without blocking the UI
    Promise.all([
      supabase.from('chat_sessions').insert([{ id, session_data: session }]),
      supabase.from('settings').upsert([{ key: 'activeSessionId', value: id }])
    ]).catch(err => {
      console.warn('[ChatManager] Non-blocking session insert failed:', err.message);
    });
    
    return session;
  }

  async getSession(id) {
    if (this.activeSession && this.activeSession.id === id) {
      return this.activeSession;
    }
    try {
      const { data } = await supabase.from('chat_sessions').select('session_data').eq('id', id).single();
      if (data?.session_data) {
        if (id === this.activeSessionId) this.activeSession = data.session_data;
        return data.session_data;
      }
    } catch (e) {
      console.warn('[ChatManager] getSession failed:', e.message);
    }
    return this.activeSession?.id === id ? this.activeSession : null;
  }

  async getActiveSession() {
    if (this.activeSession && this.activeSession.id === this.activeSessionId) {
      return this.activeSession;
    }
    if (this.activeSessionId) {
      this.activeSession = await this.getSession(this.activeSessionId);
    }
    if (!this.activeSession) {
      this.activeSession = await this.createSession();
    }
    return this.activeSession || { id: 'fallback', title: 'New Chat', messages: [], updatedAt: Date.now() };
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
      isLoading: role === 'assistant' && !content,
      streaming: false,
      ...extras,
    };

    session.messages.push(message);
    session.updatedAt = Date.now();
    
    if (session.messages.length === 1 && role === 'user') {
      session.title = content.substring(0, 30) + (content.length > 30 ? '...' : '');
    }

    // 1. Send 'ai:chat-updated' to the renderer FIRST using in-memory session
    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
      try {
        global.mainWindow.webContents.send('ai:chat-updated', session);
      } catch (err) {
        console.warn('[ChatManager] Error broadcasting ai:chat-updated:', err.message);
      }
    }

    // 2. Persist to Supabase afterwards without blocking (catch and log errors)
    supabase.from('chat_sessions').update({ session_data: session }).eq('id', session.id)
      .catch(err => console.warn('[ChatManager] Non-blocking update on addMessage failed:', err.message));
    
    return message;
  }
  
  async updateMessage(messageId, updates) {
    const session = await this.getActiveSession();
    if (!session) return false;
    
    const msg = session.messages.find(m => m.id === messageId);
    if (!msg) return false;
    
    Object.assign(msg, updates);
    session.updatedAt = Date.now();

    // 1. Send 'ai:chat-updated' to the renderer FIRST using in-memory session
    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
      try {
        global.mainWindow.webContents.send('ai:chat-updated', session);
      } catch (err) {
        console.warn('[ChatManager] Error broadcasting ai:chat-updated:', err.message);
      }
    }

    // 2. Persist to Supabase afterwards without blocking (catch and log errors)
    supabase.from('chat_sessions').update({ session_data: session }).eq('id', session.id)
      .catch(err => console.warn('[ChatManager] Non-blocking update on updateMessage failed:', err.message));
    
    return true;
  }

  async getHistory() {
    const session = await this.getActiveSession();
    return session ? session.messages : [];
  }
}

module.exports = ChatManager;
