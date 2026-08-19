/**
 * Actra Browser - Electron Main Process
 * Manages windows, BrowserView / WebContentsView tabs, IPC handlers, downloads, and app lifecycle.
 */
const { app, BrowserWindow, BrowserView, ipcMain, session, Menu, dialog, clipboard } = require('electron');
const path = require('path');
const { default: Store } = require('electron-store');
const store = new Store();

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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#FDFBF7',
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
  approvalEngine       = new ApprovalEngine(mainWindow);
  plannerEngine        = new PlannerEngine(modelGateway, memoryStore);
  chatManager          = new ChatManager();

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
  const fs = require('fs');
  const indexHtmlPath = path.join(__dirname, '../dist/index.html');

  if (fs.existsSync(indexHtmlPath)) {
    mainWindow.loadFile(indexHtmlPath);
  } else {
    mainWindow.loadURL('http://localhost:3000').catch(() => {
      console.log('Failed to load localhost:3000. Is the dev server running?');
    });
  }

  createAppMenu(mainWindow, tabManager);

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
  tabManager.sidebarWidth = Math.round(width);
  if (tabManager.activeTabId) {
    const view = tabManager.tabs.get(tabManager.activeTabId);
    if (view) tabManager.updateViewBounds(view);
  }
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
async function executeAICommand(command, activeTabId) {
  // 1. Add User Message
  await chatManager.addMessage('user', command);

  // 1. USER_REQUEST — create task + audit entry
  const task = taskManager.createTask(command, 'default');
  
  // Add Assistant Message to track progress (linked to taskId)
  const assistantMsg = await chatManager.addMessage('assistant', '', { taskId: task.id });
  
  const auditEntryId = auditLog.createEntry(task.id, command);
  const actionsProposed = [];
  const dataSourcesUsed = [];

  // Return immediately so CommandBar closes; all work is async
  (async () => {
    try {

      // ── UNDERSTAND_REQUEST ────────────────────────────────────────────
      taskManager.updateTaskStatus(task.id, 'understanding');
      const understandStep = taskManager.addStep(task.id, '🔍 Understanding your request…', 'running', 'understand');

      let understanding = null;
      let history = await chatManager.getHistory();
      if (history.length > 10) history = history.slice(-10); // cap to prevent 413
      try {
        if (!modelGateway.isAvailable()) {
          throw new Error('AI Model not available. Please set GROQ_API_KEY in your .env file.');
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
      if (needsWorkspace && !googleAuth.isAuthenticated()) {
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
      ];

      if (understanding.execution_target === 'BROWSER_UI' && understanding.route === 'ACTION_SIMPLE') {
        plan.steps = understanding.simple_plan || [];
      } else if (understanding.execution_target === 'GOOGLE_WORKSPACE_API' || (understanding.execution_target === 'BROWSER_UI' && understanding.route === 'ACTION_COMPLEX')) {
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
          const args = step.args || {};
          
          if (step.action === 'browser_navigate') {
            mainWindow.webContents.send('animate-address-bar-navigation', { tabId: activeTabId, url: args.url });
            await new Promise(r => setTimeout(r, 1000));
            tabManager.tabs.get(activeTabId).webContents.loadURL(args.url);
            await new Promise((resolve) => {
              tabManager.tabs.get(activeTabId).webContents.once('did-stop-loading', resolve);
            });
            result = `Navigated to ${args.url}`;
          } else if (step.action === 'browser_type' || step.action === 'browser_click') {
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
              taskManager.updateTaskStatus(task.id, 'executing');
            }

            if (step.action === 'browser_type') {
               result = await browserInteractionEngine.typeText(activeTabId, elementId, args.text);
            } else {
               result = await browserInteractionEngine.clickElement(activeTabId, elementId);
            }
          } else if (step.action === 'browser_press_key') {
             result = await browserInteractionEngine.pressKey(activeTabId, args.key);
          } else if (step.action === 'browser_scroll') {
             result = await browserInteractionEngine.scrollPage(activeTabId, args.amount);
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
             if (step.riskLevel > 0) {
               taskManager.updateTaskStatus(task.id, 'waiting_approval');
               const approval = await approvalEngine.evaluateAction({ name: step.action, args }, { url: pageContext.url, taskId: task.id, reason: plan.interpretation });
               if (!approval.approved) throw new Error(approval.reason || 'Rejected by user');
               taskManager.updateTaskStatus(task.id, 'executing');
             }

             if (step.action === 'send_email') result = await googleWorkspace.sendEmail(args.to, args.subject, args.body);
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
        
        const dataContext = JSON.stringify(globalGatherResults, null, 2).slice(0, 3000);
        const historyContext = history.length > 0 
          ? `Conversation History:\n${history.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n')}\n`
          : '';

        const synthPrompt = `User asked: "${command}"

${historyContext}
Gathered data:
${dataContext}

Execution History:
${globalExecutionHistory.map(h => h.action).join(' -> ')}

If the user's request was an ACTION request (e.g., you navigated, clicked, or typed), you MUST ONLY output a concise success/failure status (e.g. "✓ Task completed. The MrBeast video is playing."). Do NOT output conversational instructions explaining how the user can do it themselves.
If the user's request was INFORMATIONAL (a general question), you MUST ALWAYS respond in 3 lines or less, summarizing the answer concisely with its core meaning.

CRITICAL INSTRUCTION: If your response contains any URLs or links, you MUST output EACH link inside its own dedicated markdown code block, like this:
\`\`\`text
https://example.com
\`\`\``;

        const { text } = await modelGateway.chat([{ role: 'user', content: synthPrompt }], { maxTokens: 1500 });
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
        await chatManager.updateMessage(assistantMsg.id, { content: `Error: ${err.message}` });
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

ipcMain.handle('ai:send-chat-message', async (_, command, activeTabId) => {
  return executeAICommand(command, activeTabId);
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
    try { new Store({ name }).clear(); } catch(e){}
  });
  try { new Store().clear(); } catch(e){}
  await googleAuth.signOut();
  return { success: true };
});

ipcMain.handle('app:copy', (_, text) => {
  clipboard.writeText(String(text ?? ''));
  return { success: true };
});

ipcMain.handle('app:save-keys', async (e, keys) => {
  const { default: Store } = require('electron-store');
  const store = new Store({ name: 'config' });
  for (const key of ['cloudflareAccountId', 'cloudflareApiKey', 'groqKey']) {
    if (typeof keys?.[key] === 'string') store.set(key, keys[key].trim());
  }
  return { success: true };
});

ipcMain.handle('app:get-keys', async () => {
  const { default: Store } = require('electron-store');
  const store = new Store({ name: 'config' });
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
    const client = googleAuth.getClient();
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
