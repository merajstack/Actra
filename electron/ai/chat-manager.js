/**
 * Actra AI — Chat Manager
 *
 * Stores conversation history and manages active chat sessions.
 */
const { default: Store } = require('electron-store');

class ChatManager {
  constructor() {
    this.store = new Store({ name: 'ai-chat-history' });
    this.activeSessionId = this.store.get('activeSessionId', null);
    
    // Create an initial session if none exists
    if (!this.activeSessionId || !this.getSession(this.activeSessionId)) {
      this.createSession('New Chat');
    }
  }

  createSession(title = 'New Chat') {
    const id = 'chat_' + Date.now() + Math.random().toString(36).substr(2, 6);
    const session = {
      id,
      title,
      messages: [],
      updatedAt: Date.now(),
    };
    
    this.store.set(`sessions.${id}`, session);
    this.activeSessionId = id;
    this.store.set('activeSessionId', id);
    
    return session;
  }

  getSession(id) {
    return this.store.get(`sessions.${id}`, null);
  }

  getActiveSession() {
    if (!this.activeSessionId) return this.createSession();
    return this.getSession(this.activeSessionId);
  }
  
  clearActiveSession() {
    this.createSession('New Chat');
  }

  addMessage(role, content, extras = {}) {
    const session = this.getActiveSession();
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
    
    // Auto-generate title for the first user message
    if (session.messages.length === 1 && role === 'user') {
      session.title = content.substring(0, 30) + (content.length > 30 ? '...' : '');
    }

    this.store.set(`sessions.${session.id}`, session);
    
    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
      global.mainWindow.webContents.send('ai:chat-updated', session);
    }
    
    return message;
  }
  
  updateMessage(messageId, updates) {
    const session = this.getActiveSession();
    if (!session) return false;
    
    const msg = session.messages.find(m => m.id === messageId);
    if (!msg) return false;
    
    Object.assign(msg, updates);
    session.updatedAt = Date.now();
    this.store.set(`sessions.${session.id}`, session);
    
    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
      global.mainWindow.webContents.send('ai:chat-updated', session);
    }
    
    return true;
  }

  getHistory() {
    const session = this.getActiveSession();
    return session ? session.messages : [];
  }
}

module.exports = ChatManager;
