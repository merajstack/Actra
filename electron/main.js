/**
 * Actra Browser - Electron Main Process
 * Manages windows, BrowserView / WebContentsView tabs, IPC handlers, downloads, and app lifecycle.
 */
const { app, BrowserWindow, BrowserView, ipcMain, session, Menu, dialog, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { default: Store } = require('electron-store');
const { autoUpdater } = require('electron-updater');
const store = new Store({ projectName: 'Actra' });
const APP_NAME = 'Actra';

app.setName(APP_NAME);
app.setAppUserModelId('com.actra.browser');
process.title = APP_NAME;

const TabManager = require('./tab-manager');
const DownloadManager = require('./download-manager');
const HistoryStore = require('./history-store');
const BookmarkStore = require('./bookmark-store');
const createAppMenu = require('./menu');

// AI Subsystems
const ModelGateway    = require('./ai/model-gateway');
const PageContextEngine = require('./ai/page-context');
const BrowserActionsEngine = require('./ai/browser-actions');
const { BrowserInteractionEngine } = require('./ai/browser-interaction');
const TaskManager     = require('./ai/task-manager');
const PlannerEngine   = require('./ai/planner');
const ApprovalEngine  = require('./ai/approval-engine');
const PolicyEngine    = require('./ai/policy-engine');
const MemoryStore     = require('./ai/memory-store');
const CompanionManager = require('./ai/companion-manager');
const AuditLog        = require('./ai/audit-log');
const ChatManager     = require('./ai/chat-manager');
const googleAuth      = require('./google-auth');
const googleWorkspace = require('./ai/google-workspace');
const { LocalModelManager } = require('./local-model-manager');
const { LocalVisionServer } = require('./ai/local-vision-server');
const { BrowserAgent } = require('./ai/browser-agent');
const GroundingRouter = require('./ai/grounding-router');

let mainWindow = null;
let tabManager = null;
let downloadManager = null;

// AI Instances
let modelGateway         = null;
let pageContextEngine    = null;
let browserActionsEngine = null;
let browserInteractionEngine = null;
let taskManager          = null;
let plannerEngine        = null;
let approvalEngine       = null;
let policyEngine         = null;
let memoryStore          = null;
let companionManager     = null;
let auditLog             = null;
let chatManager          = null;
let browserAgent         = null;
let localModelManager    = null;
let localVisionServer    = null;
let groundingRouter      = null;

function getAppIconPath() {
  const candidates = [
    path.join(__dirname, '../public/app.png'),
    path.join(__dirname, '../dist/app.png'),
  ];
  return candidates.find(candidate => fs.existsSync(candidate)) || candidates[0];
}

function sendUpdaterEvent(channel, data = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function isMissingMacUpdateFeed(error) {
  return process.platform === 'darwin' && (
    error?.code === 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND' ||
    /latest-mac\.yml|Cannot find .*update info/i.test(error?.message || '')
  );
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => sendUpdaterEvent('updater:status', { status: 'checking' }));
  autoUpdater.on('update-available', (info) => sendUpdaterEvent('updater:status', {
    status: 'available',
    version: info.version,
  }));
  autoUpdater.on('update-not-available', () => sendUpdaterEvent('updater:status', { status: 'current' }));
  autoUpdater.on('download-progress', (progress) => sendUpdaterEvent('updater:status', {
    status: 'downloading',
    percent: Math.round(progress.percent),
  }));
  autoUpdater.on('update-downloaded', (info) => sendUpdaterEvent('updater:status', {
    status: 'downloaded',
    version: info.version,
  }));
  autoUpdater.on('error', (error) => {
    if (isMissingMacUpdateFeed(error)) {
      console.warn('[Updater] Mac update feed is not present in the latest GitHub release. Upload latest-mac.yml and the Mac ZIP to enable Mac updates.');
      sendUpdaterEvent('updater:status', { status: 'unavailable' });
      return;
    }
    console.error('[Updater] Update failed:', error);
    sendUpdaterEvent('updater:status', { status: 'error', message: error.message });
  });

  autoUpdater.checkForUpdatesAndNotify().catch((error) => {
    if (isMissingMacUpdateFeed(error)) {
      console.warn('[Updater] Mac update feed is not present in the latest GitHub release. Upload latest-mac.yml and the Mac ZIP to enable Mac updates.');
      sendUpdaterEvent('updater:status', { status: 'unavailable' });
      return;
    }
    console.error('[Updater] Could not check for updates:', error);
    sendUpdaterEvent('updater:status', { status: 'error', message: error.message });
  });
}

function createWindow() {
  const iconPath = getAppIconPath();
  if (process.platform === 'darwin' && app.dock) {
    try {
      app.dock.setIcon(iconPath);
    } catch (_) {}
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: APP_NAME,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#FDFBF7',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setMaxListeners(50);
  global.mainWindow = mainWindow;

  tabManager           = new TabManager(mainWindow);
  downloadManager      = new DownloadManager(mainWindow);

  // Initialize AI Subsystems
  modelGateway         = new ModelGateway();
  pageContextEngine    = new PageContextEngine(tabManager);
  browserActionsEngine = new BrowserActionsEngine(tabManager, downloadManager, BookmarkStore, HistoryStore);
  browserInteractionEngine = new BrowserInteractionEngine(tabManager);
  
  memoryStore          = new MemoryStore();
  companionManager     = new CompanionManager();
  auditLog             = new AuditLog();
  
  taskManager          = new TaskManager(mainWindow);
  policyEngine         = new PolicyEngine();
  approvalEngine       = new ApprovalEngine(policyEngine);
  plannerEngine        = new PlannerEngine(modelGateway, memoryStore);
  chatManager          = new ChatManager();
  localModelManager    = new LocalModelManager();
  const localModelPaths = localModelManager.getModelPaths();
  localVisionServer = new LocalVisionServer({
    runtimePath: localModelPaths['ui-tars-runtime'],
    modelPath: localModelPaths['ui-tars-weights'],
    projectorPath: localModelPaths['ui-tars-projector'],
  });
  localModelManager.on('status', status => sendUpdaterEvent('local-models:status', status));
  if (localModelManager.getStatus().ready) {
    localVisionServer.start().catch(error => console.error('[UI-TARS] Vision server start failed:', error.message));
  }

  // Unified grounding pipeline — resolves elements via DOM → LLM → Remote Vision → Local Vision
  groundingRouter = new GroundingRouter({
    browserInteraction:   browserInteractionEngine,
    planner:              plannerEngine,
    tabManager,
    getLocalVisionServer: () => localVisionServer,
    auditLog,
  });

  browserAgent = new BrowserAgent({
    tabManager,
    taskManager,
    chatManager,
    auditLog,
    modelGateway,
    getLocalVisionServer: () => localVisionServer,
    getLocalModelManager: () => localModelManager,
    browserInteractionEngine,
    pageContextEngine,
    groundingRouter,
    planner: plannerEngine,
  });

  // Tie TaskManager updates to React UI
  taskManager.on('task-updated', (task) => {
    let state = 'WORKING';
    if (task.status === 'completed') state = 'COMPLETED';
    if (task.status === 'failed' || task.status === 'cancelled') state = 'ERROR';
    if (task.status === 'planning') state = 'THINKING';
    
    // Broadcast to React UI so VoiceCommandBar can update
    mainWindow.webContents.send('voice-state-update', { state, message: task.outputs || task.statusMessage || task.status });
  });

  // Load renderer UI
  const indexHtmlPath = path.join(__dirname, '../dist/index.html');

  if (fs.existsSync(indexHtmlPath)) {
    mainWindow.loadFile(indexHtmlPath);
  } else {
    mainWindow.loadURL('http://localhost:3000').catch(() => {
      console.log('Failed to load localhost:3000. Is the dev server running?');
    });
  }

  createAppMenu(mainWindow, tabManager);

  setupAutoUpdater();

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  app.on('web-contents-created', (event, webContents) => {
    let isPushToTalkActive = false;

    webContents.on('before-input-event', (event, input) => {
      const isCmdOrCtrl = input.meta || input.control;
      
      if (input.key.toLowerCase() === 'd' && isCmdOrCtrl && !input.shift && !input.alt) {
        if (input.type === 'keyDown' && !input.isAutoRepeat) {
          isPushToTalkActive = true;
          if (global.mainWindow) {
            global.mainWindow.webContents.send('voice-shortcut-down');
          }
        } else if (input.type === 'keyUp') {
          isPushToTalkActive = false;
          if (global.mainWindow) {
            global.mainWindow.webContents.send('voice-shortcut-up');
          }
        }
      } else if (input.type === 'keyUp' && isPushToTalkActive) {
        // If they released Meta or Control while holding D
        if (input.key === 'Meta' || input.key === 'Control') {
          isPushToTalkActive = false;
          if (global.mainWindow) {
            global.mainWindow.webContents.send('voice-shortcut-up');
          }
        }
      }
    });
  });

  createWindow();

  // Strip Cross-Origin headers so sites like YouTube load correctly in BrowserView
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders || {};
    const blocked = [
      'cross-origin-opener-policy',
      'cross-origin-embedder-policy',
      'cross-origin-resource-policy',
    ];
    for (const key of Object.keys(headers)) {
      if (blocked.includes(key.toLowerCase())) delete headers[key];
    }
    callback({ responseHeaders: headers });
  });

  // Automatically grant permissions for microphone so renderer doesn't get silent stream
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Automatically approve media permissions for VoiceCommandBar
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'media') {
      return true;
    }
    return false;
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── Tab IPC Handlers ──────────────────────────────────────────────────────

ipcMain.handle('tab:create', (_, url, isIncognito) => tabManager.createTab(url, isIncognito));
ipcMain.handle('tab:close',  (_, tabId) => tabManager.closeTab(tabId));
ipcMain.handle('tab:navigate', (_, tabId, url) => tabManager.navigateTab(tabId, url));
ipcMain.handle('tab:setActive', (_, tabId) => tabManager.setActiveTab(tabId));
ipcMain.handle('tab:goBack', (_, tabId) => tabManager.goBack(tabId));
ipcMain.handle('tab:goForward', (_, tabId) => tabManager.goForward(tabId));
ipcMain.handle('tab:reload', (_, tabId) => tabManager.reload(tabId));
ipcMain.handle('tab:stop', (_, tabId) => tabManager.stop(tabId));
ipcMain.handle('tab:setZoom', (_, tabId, factor) => tabManager.setZoom(tabId, factor));
ipcMain.handle('tab:find', (_, tabId, text) => tabManager.findInPage(tabId, text));
ipcMain.handle('tab:stopFind', (_, tabId) => tabManager.stopFindInPage(tabId));
ipcMain.handle('tab:setVisibility', (_, tabId, visible) => tabManager.setVisibility(tabId, visible));
ipcMain.handle('tab:reopenClosed', () => tabManager.reopenClosedTab());
ipcMain.handle('tab:duplicate', (_, tabId) => tabManager.duplicateTab(tabId));

ipcMain.handle('window:isFullscreen', () => {
  return mainWindow ? mainWindow.isFullScreen() : false;
});

ipcMain.handle('updater:install', () => {
  if (!app.isPackaged) return { success: false, error: 'Updates are disabled in development.' };
  autoUpdater.quitAndInstall();
  return { success: true };
});

ipcMain.handle('local-models:get-status', () => localModelManager
  ? localModelManager.getStatus()
  : { ready: false, downloading: false, files: [], error: 'Local model manager is not ready.' });
ipcMain.handle('local-models:download', async () => {
  if (!localModelManager) return { ready: false, downloading: false, files: [], error: 'Local model manager is not ready.' };
  const status = await localModelManager.downloadAll();
  if (status.ready && localVisionServer) {
    localVisionServer.start().catch(error => console.error('[UI-TARS] Vision server start failed:', error.message));
  }
  return status;
});

ipcMain.handle('window:requestMicAccess', async () => {
  if (process.platform === 'darwin') {
    const { systemPreferences } = require('electron');
    const status = systemPreferences.getMediaAccessStatus('microphone');
    if (status !== 'granted') {
      const success = await systemPreferences.askForMediaAccess('microphone');
      return success;
    }
  }
  return true;
});

ipcMain.handle('tab:setUIChromeHeight', (_, height) => {
  tabManager.uiChromeHeight = Math.round(height);
  if (tabManager.activeTabId) {
    const view = tabManager.tabs.get(tabManager.activeTabId);
    if (view) tabManager.updateViewBounds(view);
  }
});

ipcMain.handle('tab:setSidebarWidth', (_, width) => {
  if (tabManager && typeof tabManager.setSidebarWidth === 'function') {
    tabManager.setSidebarWidth(width);
  } else if (tabManager) {
    tabManager.sidebarWidth = Math.round(width);
    if (tabManager.activeTabId) {
      const view = tabManager.tabs.get(tabManager.activeTabId);
      if (view) tabManager.updateViewBounds(view);
    }
  }
  return true;
});

// ─── AI IPC Handlers ──────────────────────────────────────────────────────

ipcMain.handle('ai:get-chat-history', () => chatManager.getHistory());

// ─── Voice IPC Handlers ───────────────────────────────────────
const whisperEngine = require('./whisper-engine');

// Pre-load the whisper model in the background
ipcMain.handle('voice:init-whisper', async () => {
  try {
    await whisperEngine.ensureLoaded();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Transcribe audio data (Float32Array sent as ArrayBuffer from renderer)
ipcMain.handle('voice:transcribe', async (_, audioBuffer) => {
  try {
    const audioData = new Float32Array(audioBuffer);
    const text = await whisperEngine.transcribe(audioData);
    return { success: true, text };
  } catch (err) {
    console.error('[voice:transcribe] Error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('ai:clear-chat', async () => {
  if (taskManager?.cancelAllActiveTasks) taskManager.cancelAllActiveTasks();
  if (approvalEngine?.rejectAll) approvalEngine.rejectAll('Cleared by user');
  await chatManager.clearActiveSession();
  return await chatManager.getHistory();
});
ipcMain.handle('ai:cancel-task', (_, taskId) => {
  taskManager.updateTaskStatus(taskId, 'cancelled');
  return true;
});
ipcMain.handle('ai:cancel-all-tasks', () => {
  const result = taskManager.cancelAllActiveTasks ? taskManager.cancelAllActiveTasks() : { success: true, cancelled: [] };
  if (approvalEngine?.rejectAll) approvalEngine.rejectAll('Cancelled by user');
  return result;
});

/**
 * Full 11-State Agentic Workflow (Now hooked into Chat UI)
 *
 * USER_REQUEST → UNDERSTAND_REQUEST → CREATE_PLAN → GATHER_INFORMATION
 * → ANALYZE_AND_REASON → PREPARE_ACTIONS → APPROVAL_CHECK
 * → [WAITING_FOR_APPROVAL] → EXECUTE_APPROVED_ACTIONS → VERIFY_RESULT
 * → AUDIT_LOG → FINAL_RESPONSE (COMPLETED)
 */
function isHtmlEmailRequest(command, args = {}) {
  return Boolean(args.html) || /\b(html|formatted|rich email|green background|colored background|background color|button|call[- ]to[- ]action|newsletter|email design|email template|render)\b/i.test(command || '');
}

async function prepareHtmlEmail(command, args) {
  if (!isHtmlEmailRequest(command, args) || args.html) return args;

  const { text } = await modelGateway.chat([{ role: 'user', content: JSON.stringify({ request: command, email: args }) }], {
    systemInstruction: 'Create the final email requested by the user. Infer the visual intent and content intent from the request. Return JSON only with string fields subject, body, and html. The html must be a complete email body using safe inline formatting with p, br, strong, em, ul, li, table, and button-like links when requested. Do not use scripts, style tags, forms, external resources, or markdown. Keep body as a faithful plain-text fallback.',
    temperature: 0.2,
    maxTokens: 1600,
  });
  const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const enhanced = JSON.parse(jsonText);
  if (!enhanced.subject || !enhanced.body || !enhanced.html) throw new Error('The AI could not create a complete HTML email draft.');
  return { ...args, subject: enhanced.subject, body: enhanced.body, html: enhanced.html, htmlRequest: true };
}

// Detects pure-chat messages via keyword heuristics — no LLM call needed.
function isLikelyConversational(command) {
  if (isPureWorkspaceRead(command)) return false;
  if (isHybridWebEmailWorkflow(command)) return false;

  const t = (command || '').trim();
  if (!t) return true;
  const words = t.split(/\s+/);
  // Very short AND no site/action words → greeting or simple question
  if (words.length <= 3 && !/\b(open|go|play|search|find|click|scroll|book|buy|watch|visit|navigate|download|send|create|write|email)\b/i.test(t)) return true;
  // Action verbs that imply the AI should DO something in the browser or workspace
  const actionPattern = /\b(open|navigate|go to|click|type into|fill|search( for)?|find|play|submit|book|buy|order|scroll|download|send|create|write|extract|solve|answer|fix|compare|reserve|email|summarize (the |this )?(page|article)|what.?s on (this|the) page|read (this|the) page|analyze (this|the)|show me (the )?(page|site)|take a screenshot)\b/i;
  return !actionPattern.test(t);
}

/**
 * Returns true ONLY for PURE inbox/calendar/sheet/drive READ or WRITE queries
 * that have no external website intent.
 * A command like "open wikipedia and send mail" is NOT a pure workspace action.
 */
function isLikelyWorkspaceAction(command) {
  return isPureWorkspaceRead(command) || isHybridWebEmailWorkflow(command);
}

// Pure workspace: user wants to read/check/send workspace data with no external web navigation.
function isPureWorkspaceRead(command) {
  const t = (command || '').trim();

  // If the command references ANY external website or URL, it is definitively NOT a pure workspace read.
  // The same comprehensive list used by isHybridWebEmailWorkflow.
  const externalSitePattern = /\b(wikipedia|youtube|github|amazon|reddit|twitter|instagram|linkedin|netflix|google|stackoverflow|discord|tiktok|spotify|notion|figma|vercel|flipkart|ebay|yahoo|bing|duckduckgo|medium|heroku|cloudflare|makemytrip|quora|substack|hashnode|dev\.to|producthunt|crunchbase|forbes|techcrunch|bbc|cnn|nytimes|arxiv|pubmed|imdb|booking|airbnb)\b|https?:\/\//i;
  if (externalSitePattern.test(t)) return false;

  const mailPattern = /\b(mail|mails|email|emails|gmail|inbox)\b/i;
  const calendarPattern = /\b(calendar|events?|meetings?|schedule)\b/i;
  const sheetPattern = /\b(sheets?|spreadsheets?)\b/i;
  const docsDrivePattern = /\b(google drive|drive files?|google docs?|docs?)\b/i;
  return mailPattern.test(t) || calendarPattern.test(t) || sheetPattern.test(t) || docsDrivePattern.test(t);
}

/**
 * Returns true for HYBRID tasks: external web navigation + email sending.
 * e.g. "Open Wikipedia about peacocks, copy data and send mail to X"
 * These must go to the FULL planner, not to Fast Path 3 gmail search.
 */
function isHybridWebEmailWorkflow(command) {
  const t = (command || '').trim();
  // Any external website or URL
  const externalSitePattern = /\b(wikipedia|youtube|github|amazon|reddit|twitter|instagram|linkedin|netflix|google|stackoverflow|discord|tiktok|spotify|notion|figma|vercel|flipkart|ebay|yahoo|bing|duckduckgo|medium|heroku|cloudflare|makemytrip|quora|substack|hashnode|dev\.to|hacker news|producthunt|crunchbase|forbes|techcrunch|bbc|cnn|nytimes|arxiv|pubmed|imdb|booking|airbnb)\b|https?:\/\//i;
  // Signal 1: any email action verb
  const emailVerbPattern = /\b(send|email|mail|forward|share)\b/i;
  // Signal 2: a recipient (email address OR "to [person/me/myself]")
  const recipientPattern = /\b(to\s+[\w.+-]+@[\w.-]+|email\s+to\s|mail\s+to\s|send\s+to\s|to\s+my\s+(professor|teacher|boss|manager|colleague|team|friend|mentor|client|partner|cto|ceo|hr)|via\s+email|by\s+email|through\s+email|to\s+myself)\b/i;
  return externalSitePattern.test(t) && emailVerbPattern.test(t) && recipientPattern.test(t);
}

// Detects tasks that require browser UI automation — routes directly to BrowserAgent
// without an LLM planning round-trip. Bypasses the planner entirely.
function isLikelyBrowserAction(command) {
  // Hybrid workflows (web research + email) need the FULL planner, not the browser-only fast path
  if (isHybridWebEmailWorkflow(command)) return false;
  // Never treat pure workspace actions (inbox check, calendar, sheets) as browser UI automation
  if (isPureWorkspaceRead(command) && !isHybridWebEmailWorkflow(command)) return false;

  const t = (command || '').trim();
  // Explicit navigation/interaction verbs
  const navPattern = /\b(open|go to|navigate to|visit|browse|load|launch|show me)\b/i;
  // Search/content interaction
  const interactPattern = /\b(search( for)?( on)?|find( on)?|look up|play|watch|click|scroll|fill( in| out)?|submit|book|buy|order|download|sign up|log in|sign in)\b/i;
  // Well-known websites (user almost always wants to navigate there)
  const sitePattern = /\b(youtube|google|twitter|reddit|amazon|netflix|github|instagram|linkedin|wikipedia|facebook|tiktok|spotify|medium|stackoverflow|discord|x\.com|bing|duckduckgo|yahoo|ebay|flipkart|notion|figma|canva|vercel|heroku|cloudflare)\b/i;
  // Raw URL
  const urlPattern = /https?:\/\//i;
  // MCQ / Quiz solver — always a browser UI task
  const mcqPattern = /\b(solve (the |all |these |this )?(mcq|mcqs|quiz|questions?|exam|test)|answer (the |all |these |this )?(mcq|mcqs|questions?|options?)|select (the |all )?(options?|answers?)|auto(matically)? (solve|answer|select)|do (the |this )?(quiz|test|exam|questions?)|click (options?|answers?) (and|then) (next|submit)|attempt (the |this )?(quiz|test|exam))\b/i;
  const tabMcqPattern = /\b(mcq|mcqs|quiz|questions?)\b.*\b(tab (one|1|two|2|three|3|four|4|five|5))/i;
  const oneByOneMcqPattern = /\bone by one\b/i.test(t) && /\b(mcq|mcqs|quiz|question|answer|option|tab)/i.test(t);
  return navPattern.test(t) || interactPattern.test(t) || sitePattern.test(t) || urlPattern.test(t)
    || mcqPattern.test(t) || tabMcqPattern.test(t) || oneByOneMcqPattern
    || /\b(solve|answer)\b.*\b(one by one|one-by-one)\b/i.test(t)
    || /\b(solve|answer)\b.*\b(mcq|mcqs|quiz)\b/i.test(t);
}

async function executeAICommand(command, activeTabId, mcqModel) {
  // 1. Add User Message
  await chatManager.addMessage('user', command);

  // 1. USER_REQUEST — create task + audit entry
  const task = taskManager.createTask(command, 'default');
  
  // Add Assistant Message to track progress (linked to taskId)
  const assistantMsg = await chatManager.addMessage('assistant', '', { taskId: task.id });
  
  const auditEntryId = auditLog.createEntry(task.id, command);
  const actionsProposed = [];
  const dataSourcesUsed = [];

  // The planner will categorize MCQs, quizzes, reasoning tasks, and general browsing as ACTION_COMPLEX.

  // Return immediately so CommandBar closes; all work is async
  (async () => {
    try {
      // ── FAST PATH 1: Pure chat/Q&A — skip planning entirely ───────────
      if (isLikelyConversational(command) && !isLikelyBrowserAction(command)) {
        taskManager.updateTaskStatus(task.id, 'analyzing');
        try {
          let history = await chatManager.getHistory();
          if (history.length > 5) history = history.slice(-5);
          const msgs = [
            ...history.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: command }
          ];
          const { text } = await modelGateway.chat(msgs, {
            maxTokens: 400, temperature: 0.7,
            systemInstruction: 'You are Actra, an autonomous AI browser assistant. Respond concisely — 3 lines max for simple questions. Never reveal internal reasoning tags.',
          });
          const out = text || 'How can I help?';
          taskManager.updateTaskStatus(task.id, 'completed', { outputs: out });
          if (assistantMsg?.id) await chatManager.updateMessage(assistantMsg.id, { content: out });
          auditLog.updateEntry(auditEntryId, { execution_status: 'success', execution_result: 'chat' });
        } catch (fastErr) {
          taskManager.updateTaskStatus(task.id, 'failed', { error: fastErr.message });
          if (assistantMsg?.id) await chatManager.updateMessage(assistantMsg.id, { content: `Error: ${fastErr.message}` });
          auditLog.updateEntry(auditEntryId, { execution_status: 'failed', error: fastErr.message });
        }
        return;
      }

      // ── FAST PATH 2: Browser action — skip planner, go directly to BrowserAgent
      // This prevents qwq-32b from misclassifying browser tasks as INFORMATIONAL
      if (isLikelyBrowserAction(command)) {
        taskManager.updateTaskStatus(task.id, 'executing');
        try {
          await browserAgent.execute(command, activeTabId, task, assistantMsg, auditEntryId, mcqModel);
        } catch (browserErr) {
          console.error('[BrowserAgent] Fast-path execution failed:', browserErr.message);
          taskManager.updateTaskStatus(task.id, 'failed', { error: browserErr.message });
          if (assistantMsg?.id) await chatManager.updateMessage(assistantMsg.id, { content: `❌ ${browserErr.message}` });
          auditLog.updateEntry(auditEntryId, { execution_status: 'failed', error: browserErr.message });
        }
        return;
      }

      // ── FAST PATH 3: Pure Google Workspace READ operations (Gmail search, Calendar, Drive) ──
      // Only activates for pure inbox/calendar/drive queries with NO external web navigation intent.
      // Hybrid workflows (e.g. "open Wikipedia and send mail") are handled by the full planner below.
      if (isPureWorkspaceRead(command) && !isHybridWebEmailWorkflow(command)) {
        taskManager.updateTaskStatus(task.id, 'executing');
        const workspaceStep = taskManager.addStep(task.id, '📬 Checking Google Workspace…', 'running', 'execute');

        try {
          if (!(await googleAuth.isAuthenticated())) {
            throw new Error('Google Workspace sign-in required. Please click "Sign in with Google" in the AI Side Panel.');
          }

          const globalGatherResults = {};

          // Gmail Search
          if (/\b(mail|mails|email|emails|gmail|inbox)\b/i.test(command)) {
            taskManager.updateStep(task.id, workspaceStep.id, 'running', '🔍 Searching your Gmail inbox…');
            const searchQuery = command.replace(/\b(check|my|mail|mails|email|emails|inbox|gmail|is|there|any|tell|me|about|show|get|all|for|related|related to)\b/gi, ' ').trim();
            const emails = await googleWorkspace.searchGmail(searchQuery || command, 25);
            globalGatherResults['search_gmail'] = emails;
          }

          // Calendar Events
          if (/\b(calendar|events?|meetings?|schedule)\b/i.test(command)) {
            taskManager.updateStep(task.id, workspaceStep.id, 'running', '📅 Checking your Google Calendar…');
            const events = await googleWorkspace.getCalendarEvents();
            globalGatherResults['get_calendar_events'] = events;
          }

          // Google Drive Files
          if (/\b(drive|files?|google drive|docs?)\b/i.test(command)) {
            taskManager.updateStep(task.id, workspaceStep.id, 'running', '📁 Searching Google Drive…');
            const driveQuery = command.replace(/\b(search|my|drive|google|files?|find|in|for|docs?)\b/gi, ' ').trim();
            const files = await googleWorkspace.searchDrive(driveQuery, 15);
            globalGatherResults['search_drive'] = files;
          }

          taskManager.updateStep(task.id, workspaceStep.id, 'completed', 'Data retrieved from Google Workspace.');

          // Synthesize response with Ground Truth data
          const analyzeStep = taskManager.addStep(task.id, '🧠 Analyzing and formatting report…', 'running', 'analyze');
          const dataContext = JSON.stringify(globalGatherResults, null, 2).slice(0, 25000);
          
          let history = await chatManager.getHistory();
          if (history.length > 5) history = history.slice(-5);
          const historyContext = history.length > 0 
            ? `Conversation History:\n${history.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n')}\n`
            : '';

          const synthPrompt = `User asked: "${command}"

${historyContext}
Gathered data (GROUND TRUTH FROM GMAIL / GOOGLE WORKSPACE):
${dataContext}

CRITICAL RESPONSE RULES:
1. STRICT GROUND TRUTH: Base your entire answer ONLY on the gathered data above. NEVER fabricate or simulate fake emails, dates, or senders.
2. RICH STRUCTURED EXECUTIVE FORMAT (When emails are found):
   - Start with: "I checked your Gmail for emails related to [Topic]. I found [X] relevant email(s):"
   - For each email found (ordered chronologically from most recent):
     ### [Email Subject / Key Event Name] — [Formatted Date]
     - **Status / Summary:** [Direct takeaway, e.g. Selected for Round 2 / Registration Confirmed]
     - **Sender:** [Sender name / email]
     - **Key Details & Guidelines:** [Include assessment window, duration, format, questions, word count, proctoring rules, system requirements, deadlines, team details, etc. exactly as mentioned in the email body]
   - Mention if any follow-up emails were checked or if no newer emails exist after the latest date.
   - If the user asks for the full content of an email, provide the complete email body accurately.
3. If no matching data was found or "no_emails_found" is in the gathered data, state truthfully that you searched the inbox but no emails matching that topic were found.

CRITICAL INSTRUCTION: If your response contains any URLs or links, you MUST output EACH link inside its own dedicated markdown code block, like this:
\`\`\`text
https://example.com
\`\`\``;

          const systemInstruction = 'You are Actra, an autonomous AI browser assistant with direct authorized access to Google Workspace. Summarize ground-truth data accurately with complete fidelity. Never leak internal reasoning tags.';

          let { text } = await modelGateway.chat([{ role: 'user', content: synthPrompt }], { maxTokens: 2500, systemInstruction });

          taskManager.updateStep(task.id, analyzeStep.id, 'completed');
          taskManager.updateTaskStatus(task.id, 'completed', { outputs: text });
          if (assistantMsg?.id) await chatManager.updateMessage(assistantMsg.id, { content: text });
          auditLog.updateEntry(auditEntryId, { execution_status: 'success', execution_result: 'workspace_success' });

        } catch (wsErr) {
          console.error('[Workspace] Fast-path execution failed:', wsErr.message);
          taskManager.updateStep(task.id, workspaceStep.id, 'failed', wsErr.message);
          taskManager.updateTaskStatus(task.id, 'failed', { error: wsErr.message });
          if (assistantMsg?.id) await chatManager.updateMessage(assistantMsg.id, { content: `❌ ${wsErr.message}` });
          auditLog.updateEntry(auditEntryId, { execution_status: 'failed', error: wsErr.message });
        }
        return;
      }

      // ── UNDERSTAND_REQUEST (Workspace API tasks only) ─────────────────
      taskManager.updateTaskStatus(task.id, 'understanding');
      const understandStep = taskManager.addStep(task.id, '🔍 Understanding your request…', 'running', 'understand');

      let understanding = null;
      let history = await chatManager.getHistory();
      if (history.length > 5) history = history.slice(-5); // cap to 5 messages to save tokens
      try {
        if (modelGateway.isQuotaExhausted && modelGateway.isQuotaExhausted()) {
          throw modelGateway.getLastQuotaError();
        }
        if (!modelGateway.isAvailable()) {
          throw new Error('AI Model not available. Please configure your Cloudflare or Groq credentials in Settings (chrome://settings).');
        }
        understanding = await plannerEngine.understandRequest(command, history);
        taskManager.updateTaskStatus(task.id, 'understanding', { understanding });
        taskManager.updateStep(task.id, understandStep.id, 'completed',
          `Intent: ${understanding.intent} | Apps: ${understanding.required_apps?.join(', ')}`);
      } catch (err) {
        taskManager.updateStep(task.id, understandStep.id, 'failed', err.message);
        throw err;
      }

      // Check auth early if workspace is needed
      const needsWorkspace = understanding.required_apps?.some(a =>
        a && ['gmail', 'calendar', 'sheets', 'drive', 'docs'].includes(a.toLowerCase())
      );
      if (needsWorkspace && !(await googleAuth.isAuthenticated())) {
        throw new Error('Google Workspace sign-in required. Please click "Sign in with Google" in the AI Side Panel.');
      }

      // ── ROUTING & PLANNING ───────────────────────────────────────────
      taskManager.updateTaskStatus(task.id, 'planning');
      
      let plan = { steps: [], interpretation: understanding.intent };
      let finalPlanInterpretation = understanding.intent;
      const globalExecutionHistory = [];
      const globalGatherResults = {};
      
      // Get initial page context
      let pageContext = { url: 'unknown', title: 'unknown' };
      try {
        const ctxPromise = pageContextEngine.getContext(activeTabId);
        pageContext = await Promise.race([ctxPromise, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 3000))]);
      } catch { /* use defaults */ }

      // Define all available tools for the planner
      const tools = [
        {
          name: 'search_gmail',
          description: 'Search Gmail for emails matching a query',
          parameters: { type: 'object', properties: {
            query:      { type: 'string', description: 'Gmail search query' },
            maxResults: { type: 'number', description: 'Max emails to return (default 10)' },
          }, required: ['query'] },
        },
        {
          name: 'read_gmail_thread',
          description: 'Read a full Gmail email thread by thread ID',
          parameters: { type: 'object', properties: {
            threadId: { type: 'string', description: 'Gmail thread ID' },
          }, required: ['threadId'] },
        },
        {
          name: 'get_calendar_events',
          description: 'Get upcoming Google Calendar events',
          parameters: { type: 'object', properties: {
            timeMin:    { type: 'string', description: 'ISO 8601 start time (defaults to now)' },
            timeMax:    { type: 'string', description: 'ISO 8601 end time (defaults to +7 days)' },
            maxResults: { type: 'number', description: 'Max events to return' },
          }},
        },
        {
          name: 'create_calendar_event',
          description: 'Create a Google Calendar event',
          parameters: { type: 'object', properties: {
            title:          { type: 'string', description: 'Event title' },
            startDateTime:  { type: 'string', description: 'ISO 8601 start date/time' },
            endDateTime:    { type: 'string', description: 'ISO 8601 end date/time' },
            attendeeEmails: { type: 'array', items: { type: 'string' }, description: 'Attendee email addresses' },
            description:    { type: 'string', description: 'Event description' },
          }, required: ['title', 'startDateTime', 'endDateTime'] },
        },
        {
          name: 'read_sheet',
          description: 'Read data from a Google Sheet',
          parameters: { type: 'object', properties: {
            spreadsheetId: { type: 'string', description: 'Google Sheet ID' },
            range:         { type: 'string', description: 'A1 notation range (e.g. Sheet1!A1:E20)' },
          }, required: ['spreadsheetId', 'range'] },
        },
        {
          name: 'write_sheet',
          description: 'Append a new row to a Google Sheet',
          parameters: { type: 'object', properties: {
            spreadsheetId: { type: 'string', description: 'Google Sheet ID' },
            range:         { type: 'string', description: 'A1 notation range' },
            values:        { type: 'array',  items: { type: 'string' }, description: 'Array of cell values to append' },
          }, required: ['spreadsheetId', 'range', 'values'] },
        },
        {
          name: 'update_sheet',
          description: 'Update specific cells in a Google Sheet',
          parameters: { type: 'object', properties: {
            spreadsheetId: { type: 'string', description: 'Google Sheet ID' },
            range:         { type: 'string', description: 'A1 notation range to update' },
            values:        { type: 'array',  items: { type: 'array', items: { type: 'string' } }, description: '2D array of values' },
          }, required: ['spreadsheetId', 'range', 'values'] },
        },
        {
          name: 'search_drive',
          description: 'Search Google Drive for files',
          parameters: { type: 'object', properties: {
            query: { type: 'string', description: 'Search terms (leave empty if just filtering by type)' },
            mimeType: { type: 'string', description: 'Optional MIME type (e.g. application/vnd.google-apps.spreadsheet for Google Sheets)' },
          }},
        },
        {
          name: 'send_email',
          description: 'Send an email via Gmail',
          parameters: { type: 'object', properties: {
            to:      { type: 'string', description: 'Recipient email address' },
            subject: { type: 'string', description: 'Email subject line' },
            body:    { type: 'string', description: 'Full email body text' },
            html:    { type: 'string', description: 'Optional HTML body. Use only for formatting, not scripts.' },
          }, required: ['to', 'subject', 'body'] },
        },
        {
          name: 'create_doc',
          description: 'Create a new Google Doc',
          parameters: { type: 'object', properties: {
            title:   { type: 'string', description: 'Document title' },
            content: { type: 'string', description: 'Document content' },
          }, required: ['title'] },
        },
        {
          name: 'browser_click',
          description: 'Clicks an element based on its semantic description.',
          parameters: { type: 'object', properties: {
            targetDescription: { type: 'string', description: 'Semantic description of element (e.g., "Search button")' }
          }, required: ['targetDescription'] },
        },
        {
          name: 'browser_type',
          description: 'Types text into an input field based on its semantic description.',
          parameters: { type: 'object', properties: {
            targetDescription: { type: 'string', description: 'Semantic description of element (e.g., "Search input")' },
            text: { type: 'string', description: 'Text to type' }
          }, required: ['targetDescription', 'text'] },
        },
        {
          name: 'browser_press_key',
          description: 'Presses a keyboard key on the focused element (e.g., "Enter", "Escape").',
          parameters: { type: 'object', properties: {
            key: { type: 'string', description: 'Key to press, e.g., "Enter"' }
          }, required: ['key'] },
        },
        {
          name: 'browser_scroll',
          description: 'Scrolls the current web page vertically.',
          parameters: { type: 'object', properties: {
            amount: { type: 'number', description: 'Pixels to scroll (positive for down, negative for up). Default 500' }
          }},
        },
        {
          name: 'browser_navigate',
          description: 'Animates the virtual cursor to the browser address bar and navigates to a URL.',
          parameters: { type: 'object', properties: {
            url: { type: 'string', description: 'URL to navigate to' }
          }, required: ['url'] },
        },
        {
          name: 'browser_extract_page_text',
          description: 'Extracts the main readable text content from the currently active browser tab for research, formatting, or sending via email.',
          parameters: { type: 'object', properties: {} },
        },
        {
          name: 'browser_take_screenshot',
          description: 'Captures a screenshot of the currently active browser tab.',
          parameters: { type: 'object', properties: {} },
        },
      ];

      if (understanding.execution_target === 'BROWSER_UI') {
        // Hand off entirely to the Browser Agent
        try {
          await browserAgent.execute(command, activeTabId, task, assistantMsg, auditEntryId, mcqModel);
        } catch (error) {
          console.error('[BrowserAgent] workflow failed:', error);
          taskManager.updateTaskStatus(task.id, 'failed', { error: error.message });
          if (assistantMsg?.id) {
            const prefix = (error?.isModelQuotaError || error?.code?.startsWith('QUOTA_')) ? '⚠️ ' : 'Error: ';
            await chatManager.updateMessage(assistantMsg.id, { content: `${prefix}${error.message}` });
          }
          auditLog.updateEntry(auditEntryId, { execution_status: 'failed', error: error.message });
        }
        return { success: true, taskId: task.id };
      } else if (understanding.execution_target === 'GOOGLE_WORKSPACE_API') {
        const planStep = taskManager.addStep(task.id, '📋 Generating Macro-Plan…', 'running', 'plan');

        let complexPlan = await plannerEngine.createPlan(understanding, pageContext, tools, history, []);
        plan = complexPlan;
        taskManager.updateStep(task.id, planStep.id, 'completed', plan.interpretation);
        finalPlanInterpretation = plan.interpretation;
      } else {
        // INFORMATIONAL
        plan.steps = [];
      }

      auditLog.updateEntry(auditEntryId, {
        agent_plan: plan.interpretation,
        actions_proposed: plan.steps.map(s => s.action),
        approval_required: understanding.approval_required,
      });

      // ── EXECUTION LOOP ──────────────────────────────────────────────
      let stepIndex = 0;
      let replans = 0;
      
      while (stepIndex < plan.steps.length && replans < 3) {
        if (taskManager.getTask(task.id).status === 'cancelled') break;
        const step = plan.steps[stepIndex];
        const uiStep = taskManager.addStep(task.id, `🚀 ${step.description}`, 'running', 'execute');

        try {
          let result;
          let args = step.args || {};
          
          if (step.action === 'browser_navigate') {
            mainWindow.webContents.send('animate-address-bar-navigation', { tabId: activeTabId, url: args.url });
            await new Promise(r => setTimeout(r, 1000));
            tabManager.tabs.get(activeTabId).webContents.loadURL(args.url);
            await new Promise((resolve) => {
              tabManager.tabs.get(activeTabId).webContents.once('did-stop-loading', resolve);
            });
            result = `Navigated to ${args.url}`;
          } else if (step.action === 'browser_type' || step.action === 'browser_click') {
            // Prefer screenshot grounding. DOM resolution remains a recovery path for pages
            // where the vision server cannot start or returns an unusable action.
            let visualAction = null;
            if (localVisionServer && localModelManager?.getStatus().ready) {
              try {
                const screenshot = await tabManager.captureScreenshot(activeTabId);
                if (screenshot) {
                  visualAction = await localVisionServer.infer(
                    screenshot,
                    `${step.action === 'browser_click' ? 'Click' : 'Type'} the ${args.targetDescription || 'requested control'}. ${step.action === 'browser_type' ? `Enter exactly: ${args.text || ''}` : ''}`
                  );
                }
              } catch (error) {
                console.warn('[UI-TARS] Visual action failed, using DOM recovery:', error.message);
              }
            }

            if (visualAction && (visualAction.action === 'click' || visualAction.action === 'type') && Number.isFinite(visualAction.x) && Number.isFinite(visualAction.y)) {
              if (step.riskLevel > 0) {
                taskManager.updateTaskStatus(task.id, 'waiting_approval');
                const approval = await approvalEngine.evaluateAction({ name: step.action, args }, { url: pageContext.url, taskId: task.id, reason: plan.interpretation });
                if (!approval.approved) throw new Error(approval.reason || 'Rejected by user');
                if (approval.editedArgs) args = { ...args, ...approval.editedArgs };
                taskManager.updateTaskStatus(task.id, 'executing');
              }
              result = visualAction.action === 'type'
                ? await browserInteractionEngine.typeAt(activeTabId, visualAction.x, visualAction.y, args.text || visualAction.text || '')
                : await browserInteractionEngine.clickAt(activeTabId, visualAction.x, visualAction.y);
            } else {
            // 1. Local Semantic Resolution with State-Based Waiting (up to 15s)
            let elementId = null;
            let candidates = [];
            
            for (let attempt = 0; attempt < 15; attempt++) {
              if (taskManager.getTask(task.id).status === 'cancelled') break;
              const res = await browserInteractionEngine.resolveElementLocally(activeTabId, args.targetDescription, step.action);
              elementId = res.elementId;
              candidates = res.candidates;
              
              // If we found an exact match OR we found multiple valid candidates for fallback, we can stop waiting
              if (elementId || candidates.length > 0) break;
              
              // Otherwise, wait 1 second for the DOM to update (e.g. search results loading)
              await new Promise(r => setTimeout(r, 1000));
            }
            
            // 2. LLM Fallback if not found locally
            if (!elementId) {
               const fallbackDOM = { url: pageContext.url, elements: candidates };
               elementId = await plannerEngine.resolveElementFallback(args.targetDescription, fallbackDOM);
            }
            
            if (!elementId) {
               throw new Error(`Element not found: ${args.targetDescription}`);
            }
            
            // 3. Approval Check
            if (step.riskLevel > 0) {
              taskManager.updateTaskStatus(task.id, 'waiting_approval');
              const approval = await approvalEngine.evaluateAction({ name: step.action, args }, { url: pageContext.url, taskId: task.id, reason: plan.interpretation });
              if (!approval.approved) throw new Error(approval.reason || 'Rejected by user');
              if (approval.editedArgs) args = { ...args, ...approval.editedArgs };
              taskManager.updateTaskStatus(task.id, 'executing');
            }

            if (step.action === 'browser_type') {
               result = await browserInteractionEngine.typeText(activeTabId, elementId, args.text);
            } else {
               result = await browserInteractionEngine.clickElement(activeTabId, elementId);
            }
            }
          } else if (step.action === 'browser_press_key') {
             result = await browserInteractionEngine.pressKey(activeTabId, args.key);
          } else if (step.action === 'browser_scroll') {
             let visualAction = null;
             if (localVisionServer && localModelManager?.getStatus().ready) {
               try {
                 const screenshot = await tabManager.captureScreenshot(activeTabId);
                 if (screenshot) visualAction = await localVisionServer.infer(screenshot, `Scroll ${args.amount < 0 ? 'up' : 'down'} to continue the task.`);
               } catch (error) {
                 console.warn('[UI-TARS] Visual scroll failed, using planner amount:', error.message);
               }
             }
             const amount = visualAction?.action === 'scroll' && Number.isFinite(visualAction.amount)
               ? (visualAction.direction === 'up' ? -Math.abs(visualAction.amount) : Math.abs(visualAction.amount))
               : args.amount;
             result = await browserInteractionEngine.scrollPage(activeTabId, amount);
          } else if (step.action === 'browser_extract_page_text') {
             const tabView = tabManager.tabs.get(activeTabId);
             if (!tabView) throw new Error('No active browser tab found for extraction.');
             
             // Wait 1.5s for dynamic content to render
             await new Promise(r => setTimeout(r, 1500));
             
             const extracted = await tabView.webContents.executeJavaScript(`
               (() => {
                 const clone = document.body.cloneNode(true);
                 clone.querySelectorAll('script, style, noscript, nav, header, footer, svg, iframe, .ad, .ads').forEach(el => el.remove());
                 const mainEl = clone.querySelector('main, article, #content, #mw-content-text') || clone;
                 const title = document.title || '';
                 const text = mainEl.innerText.replace(/\\n{3,}/g, '\\n\\n').trim();
                 return {
                   title,
                   url: window.location.href,
                   text: text.slice(0, 8000)
                 };
               })();
             `);
             
             globalGatherResults['browser_extract_page_text'] = extracted;
             result = `Extracted ${extracted.text?.length || 0} characters from "${extracted.title || 'page'}"`;
           } else if (step.action === 'browser_take_screenshot') {
             const screenshot = await tabManager.captureScreenshot(activeTabId);
             globalGatherResults['browser_take_screenshot'] = { captured: Boolean(screenshot) };
             result = 'Captured page screenshot';
          } else if ((step.action || '').startsWith('search_') || (step.action || '').startsWith('read_') || (step.action || '').startsWith('get_')) {
             // Safe Gather operations
             if (step.action === 'search_gmail') result = await googleWorkspace.searchGmail(args.query, args.maxResults);
             else if (step.action === 'read_gmail_thread') result = await googleWorkspace.readGmailThread(args.threadId);
             else if (step.action === 'get_calendar_events') result = await googleWorkspace.getCalendarEvents(args.timeMin, args.timeMax, args.maxResults);
             else if (step.action === 'read_sheet') result = await googleWorkspace.readSheet(args.spreadsheetId, args.range);
             else if (step.action === 'search_drive') result = await googleWorkspace.searchDrive(args.query, 10, args.mimeType);
             
             globalGatherResults[step.action] = result;
             result = Array.isArray(result) ? `Found ${result.length} results` : String(result).slice(0, 200);
          } else {
             // Other Write Operations
             if (step.action === 'send_email') {
               // Interpolate extracted page content into email body if needed
               if (typeof args.body === 'string' && args.body.includes('{{browser_extract_page_text.text}}')) {
                 const extracted = globalGatherResults['browser_extract_page_text']?.text || '';
                 args.body = args.body.replace(/\{\{browser_extract_page_text\.text\}\}/g, extracted);
               } else if ((!args.body || args.body.length < 50) && globalGatherResults['browser_extract_page_text']?.text) {
                 args.body = globalGatherResults['browser_extract_page_text'].text;
               }

               args = await prepareHtmlEmail(command, args);
             }
             if (step.riskLevel > 0) {
               taskManager.updateTaskStatus(task.id, 'waiting_approval');
               const approval = await approvalEngine.evaluateAction({ name: step.action, args }, { url: pageContext.url, taskId: task.id, reason: plan.interpretation });
               if (!approval.approved) throw new Error(approval.reason || 'Rejected by user');
               if (approval.editedArgs) args = { ...args, ...approval.editedArgs };
               taskManager.updateTaskStatus(task.id, 'executing');
             }

             if (step.action === 'send_email') result = await googleWorkspace.sendEmail(args.to, args.subject, args.body, args.html);
             else if (step.action === 'write_sheet') result = await googleWorkspace.writeSheet(args.spreadsheetId, args.range, args.values);
             else if (step.action === 'update_sheet') result = await googleWorkspace.updateSheet(args.spreadsheetId, args.range, args.values);
             else if (step.action === 'create_doc') result = await googleWorkspace.createDoc(args.title, args.content);
             else if (step.action === 'create_calendar_event') result = await googleWorkspace.createCalendarEvent(args.title, args.startDateTime, args.endDateTime, args.attendeeEmails, args.description);
             else result = `Executed: ${step.action}`;
          }

          taskManager.updateStep(task.id, uiStep.id, 'completed', String(result).slice(0, 200));
          globalExecutionHistory.push({ action: step.action, result: String(result).slice(0, 200) });
          stepIndex++;

        } catch (err) {
           taskManager.updateStep(task.id, uiStep.id, 'failed', err.message);
           globalExecutionHistory.push({ action: step.action, result: `Failed: ${err.message}` });
           
           if (understanding.route === 'ACTION_SIMPLE') {
             break; // Fast-path does not attempt to replan. Fail fast.
           }

           replans++;
           if (replans >= 3) break;

           const replanStep = taskManager.addStep(task.id, `🔄 Replanning (Attempt ${replans})...`, 'running', 'plan');
           
           try {
             pageContext = await pageContextEngine.getContext(activeTabId);
           } catch { /* keep old context */ }

           plan = await plannerEngine.createPlan(understanding, pageContext, tools, history, globalExecutionHistory);
           taskManager.updateStep(task.id, replanStep.id, 'completed', plan.interpretation);
           stepIndex = 0; // Restart new plan sequence
        }
      }

      // ── ANALYZE_AND_REASON (Final Synthesis) ─────────────────────────
      taskManager.updateTaskStatus(task.id, 'analyzing');
      let finalResponseText = '';

      if (understanding.route === 'ACTION_SIMPLE') {
        const analyzeStep = taskManager.addStep(task.id, '🧠 Finalizing...', 'running', 'analyze');
        const failedSteps = globalExecutionHistory.filter(h => h.result.startsWith('Failed:'));
        
        if (failedSteps.length > 0) {
          finalResponseText = `❌ Task failed: ${failedSteps[0].result}`;
        } else {
          // Task-Level Verification
          let taskVerified = true;
          let verifyMessage = "Task completed successfully.";
          
          if ((understanding.intent || '').toLowerCase().includes('video') && (understanding.intent || '').toLowerCase().includes('play')) {
            taskVerified = false;
            
            // Event/State-based polling (max 5 seconds)
            for (let i = 0; i < 5; i++) {
              await new Promise(r => setTimeout(r, 1000));
              
              const videoVerify = await tabManager.tabs.get(activeTabId).webContents.executeJavaScript(`
                (() => {
                  if (window.location.href.includes('/watch') || document.querySelector('video')) {
                    const video = document.querySelector('video');
                    if (video && !video.paused) return 'Playing';
                    if (video) return 'Loaded';
                  }
                  return null;
                })();
              `);
              
              if (videoVerify === 'Playing') {
                taskVerified = true;
                verifyMessage = "Playing video.";
                break;
              } else if (videoVerify === 'Loaded' && i >= 3) {
                // If it loaded but hasn't started playing after 4s (e.g. ad or autoplay disabled)
                taskVerified = true;
                verifyMessage = "Playing video.";
                break;
              }
            }
          }
          
          if (taskVerified) {
            finalResponseText = `✓ ${verifyMessage}`;
          } else {
            finalResponseText = `Couldn't start the video.`;
          }
        }
        taskManager.updateStep(task.id, analyzeStep.id, 'completed');
      } else {
        const analyzeStep = taskManager.addStep(task.id, '🧠 Synthesizing final response...', 'running', 'analyze');
        
        const dataContext = JSON.stringify(globalGatherResults, null, 2).slice(0, 20000);
        const historyContext = history.length > 0 
          ? `Conversation History:\n${history.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n')}\n`
          : '';

        const synthPrompt = `User asked: "${command}"

${historyContext}
Gathered data (GROUND TRUTH FROM GMAIL & GOOGLE WORKSPACE):
${dataContext}

Execution History:
${globalExecutionHistory.map(h => h.action).join(' -> ')}

CRITICAL RESPONSE RULES:
1. STRICT GROUND TRUTH: Base your entire answer ONLY on the gathered data above. NEVER fabricate, invent, or hallucinate email senders, subjects, dates, snippets, or body contents.
2. RICH STRUCTURED EXECUTIVE FORMAT (When emails are found):
   - Start with: "I checked your Gmail for emails related to [Topic]. I found [X] relevant email(s):"
   - For each email found (ordered chronologically from most recent):
     ### [Email Subject / Key Event Name] — [Formatted Date]
     - **Status / Summary:** [Direct takeaway, e.g. Selected for Round 2 / Registration Confirmed]
     - **Sender:** [Sender name / email]
     - **Key Details & Guidelines:** [Include assessment window, duration, format, questions, word count, proctoring rules, system requirements, deadlines, team details, etc. exactly as mentioned in the email body]
   - Mention if any follow-up emails were checked or if no newer emails exist after the latest date.
   - If the user asks for the full content of an email, provide the complete email body accurately.
3. If no matching data was found or "no_emails_found" is in the gathered data, state truthfully that you searched the inbox but no emails matching that topic were found.
4. If the user's request was a browser UI action, output a concise status.

CRITICAL INSTRUCTION: If your response contains any URLs or links, you MUST output EACH link inside its own dedicated markdown code block, like this:
\`\`\`text
https://example.com
\`\`\``;

        const systemInstruction = 'You are Actra, an autonomous AI browser assistant. You HAVE the capability to browse the web, take screenshots, click elements, read pages, fill forms, and solve complex tasks automatically. Do not claim you lack browser or screenshot capabilities. Never leak internal reasoning tags.';

        let { text } = await modelGateway.chat([{ role: 'user', content: synthPrompt }], { maxTokens: 1500, systemInstruction });
        
        // (Internal reasoning tags like <think> are stripped natively by model-gateway)
        
        finalResponseText = text;
        taskManager.updateStep(task.id, analyzeStep.id, 'completed');
      }
      
      taskManager.updateTaskStatus(task.id, 'logging');
      const summary = globalExecutionHistory.length > 0
        ? `✅ Completed ${globalExecutionHistory.length} action(s).`
        : `✅ ${finalPlanInterpretation}`;

      auditLog.updateEntry(auditEntryId, { execution_status: 'success', execution_result: summary });
      const responseText = finalResponseText || 'Task completed, but Actra returned an empty response.';
      taskManager.updateTaskStatus(task.id, 'completed', { outputs: responseText });
      if (assistantMsg?.id) await chatManager.updateMessage(assistantMsg.id, { content: responseText });

    } catch (err) {
      console.error('[AI] Workflow failed:', err.message);
      taskManager.updateTaskStatus(task.id, 'failed', { error: err.message });
      if (assistantMsg?.id) {
        const prefix = (err?.isModelQuotaError || err?.code?.startsWith('QUOTA_')) ? '⚠️ ' : 'Error: ';
        await chatManager.updateMessage(assistantMsg.id, { content: `${prefix}${err.message}` });
      }
      auditLog.updateEntry(auditEntryId, {
        execution_status: 'failed',
        error: err.message,
      });
    }
  })();

  // Return immediately — CommandBar closes right away
  return { success: true, taskId: task.id };
}



ipcMain.handle('ai:send-chat-message', async (_, command, activeTabId, mcqModel) => {
  return executeAICommand(command, activeTabId, mcqModel);
});

ipcMain.handle('voice:execute-command', async (_, command) => {
  return executeAICommand(command, tabManager.activeTabId);
});

// Approve / Edit / Reject
ipcMain.handle('ai:resolve-approval', (_, approvalId, approved) => {
  return approvalEngine.resolveApproval(approvalId, approved);
});

ipcMain.handle('ai:edit-approval', (_, approvalId, newArgs) => {
  return approvalEngine.editAndApprove(approvalId, newArgs);
});

ipcMain.handle('ai:enhance-approval', async (_, approvalId) => {
  const approval = approvalEngine.getPendingApproval(approvalId);
  if (!approval || approval.action.name !== 'send_email') {
    return { success: false, error: 'Email approval request is no longer available.' };
  }

  try {
    const { text } = await modelGateway.chat([
      {
        role: 'user',
        content: JSON.stringify({
          to: approval.action.args.to,
          subject: approval.action.args.subject,
          body: approval.action.args.body,
        }),
      },
    ], {
      systemInstruction: 'Improve this email for clarity and professional formatting. Remove accidental prompt noise, internal instructions, duplicated whitespace, and irrelevant metadata. Preserve the meaning, recipient, and requested facts. Return JSON only with string fields subject, body, and html. The html must be a simple email body using safe tags such as p, br, strong, em, ul, and li. Do not include scripts, style tags, or external resources.',
      temperature: 0.2,
      maxTokens: 1200,
    });
    const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const enhanced = JSON.parse(jsonText);
    if (!enhanced.subject || !enhanced.body || !enhanced.html) throw new Error('AI returned an incomplete email.');

    const action = { ...approval.action, args: { ...approval.action.args, subject: enhanced.subject, body: enhanced.body, html: enhanced.html } };
    const updated = approvalEngine.updatePendingAction(approvalId, action);
    if (!updated) return { success: false, error: 'Email approval request expired.' };
    mainWindow.webContents.send('ai:approval-updated', updated);
    return { success: true, approval: updated };
  } catch (error) {
    console.error('[Approval] Email enhancement failed:', error);
    return { success: false, error: error.message };
  }
});

// Task data & approvals
ipcMain.handle('ai:get-companions',   () => companionManager.getAllCompanions());
ipcMain.handle('ai:get-tasks',        () => taskManager.getAllTasks());
ipcMain.handle('ai:get-approvals',    () => approvalEngine.getPendingApprovals?.() || []);
ipcMain.handle('tab:setRightOverlayWidth', (_, width) => {
  if (tabManager && typeof tabManager.setRightOverlayWidth === 'function') {
    tabManager.setRightOverlayWidth(width);
  }
  return true;
});

// Audit log
ipcMain.handle('ai:get-logs', (_, limit = 50) => auditLog.getLogs(limit));

// ─── Google Auth IPCs ──────────────────────────────────────────────────────

ipcMain.handle('auth:google-status',  () => googleAuth.isAuthenticated());

ipcMain.handle('app:clear-data', async () => {
  const { default: Store } = require('electron-store');
  ['config', 'google-auth-tokens', 'bookmarks', 'history', 'memory'].forEach(name => {
    try { new Store({ name, projectName: 'Actra' }).clear(); } catch(e){}
  });
  try { new Store({ projectName: 'Actra' }).clear(); } catch(e){}
  await googleAuth.signOut();
  return { success: true };
});

ipcMain.handle('app:copy', (_, text) => {
  clipboard.writeText(String(text ?? ''));
  return { success: true };
});

ipcMain.handle('app:save-keys', async (e, keys) => {
  const { default: Store } = require('electron-store');
  const store = new Store({ name: 'config', projectName: 'Actra' });
  for (const key of ['cloudflareAccountId', 'cloudflareApiKey', 'groqKey']) {
    if (typeof keys?.[key] === 'string') store.set(key, keys[key].trim());
  }
  if (modelGateway?.clearQuotaError) {
    modelGateway.clearQuotaError();
  }
  return { success: true };
});

ipcMain.handle('app:get-keys', async () => {
  const { default: Store } = require('electron-store');
  const store = new Store({ name: 'config', projectName: 'Actra' });
  return {
    cloudflareAccountId: store.get('cloudflareAccountId', ''),
    cloudflareApiKey: store.get('cloudflareApiKey', ''),
    groqKey: store.get('groqKey', ''),
  };
});

ipcMain.handle('auth:google-signin',  async () => {
  try { const result = await googleAuth.signIn(); return result; }
  catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('auth:google-profile', async () => {
  try {
    const { google } = require('googleapis');
    const client = await googleAuth.getClient();
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data } = await oauth2.userinfo.get();
    return { success: true, profile: { name: data.name, picture: data.picture, email: data.email } };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('auth:google-signout', async () => {
  await googleAuth.signOut();
  return { success: true };
});
