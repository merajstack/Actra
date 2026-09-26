/**
 * Actra — BrowserAgent + TaskDecomposer
 *
 * TaskDecomposer: Rule-based, zero-LLM browser task planning for known patterns.
 * BrowserAgent:   Executes plans via DOM. Uses LLM only for truly unknown tasks.
 */

let PageContextEngine;
try {
  PageContextEngine = require('./page-context');
} catch (_) {}

let PlannerEngine;
try {
  PlannerEngine = require('./planner');
} catch (_) {}

const BROWSER_PLANNER_TOOLS = [
  {
    name: 'browser_navigate',
    description: 'Navigates the browser to a specified URL.',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string', description: 'The absolute HTTP or HTTPS URL to load' } },
      required: ['url'],
    },
  },
  {
    name: 'browser_type',
    description: 'Types text into a focused or targeted input field on the current page.',
    parameters: {
      type: 'object',
      properties: {
        targetDescription: { type: 'string', description: 'Semantic description of the input element to type into (e.g. "search input", "email input")' },
        text: { type: 'string', description: 'The text string to type into the input field' },
      },
      required: ['targetDescription', 'text'],
    },
  },
  {
    name: 'browser_click',
    description: 'Clicks an interactive element on the current page.',
    parameters: {
      type: 'object',
      properties: {
        targetDescription: { type: 'string', description: 'Semantic description of the element to click (e.g. "search button", "first search result link", "sign in button")' },
      },
      required: ['targetDescription'],
    },
  },
  {
    name: 'browser_press_key',
    description: 'Sends a keyboard key press to the active page.',
    parameters: {
      type: 'object',
      properties: { key: { type: 'string', description: 'Key to press, e.g. "Enter", "Tab", "Escape", "ArrowDown"' } },
      required: ['key'],
    },
  },
  {
    name: 'browser_scroll',
    description: 'Scrolls the active browser window up or down.',
    parameters: {
      type: 'object',
      properties: { amount: { type: 'number', description: 'Scroll delta in pixels (positive for down, negative for up)' } },
      required: ['amount'],
    },
  },
  {
    name: 'browser_extract_page_text',
    description: 'Extracts the main readable text content from the currently active browser tab for research, formatting, or reporting.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'wait',
    description: 'Waits for a specified number of milliseconds for the page to update.',
    parameters: {
      type: 'object',
      properties: { ms: { type: 'number', description: 'Milliseconds to wait (e.g. 2000)' } },
      required: ['ms'],
    },
  },
];

/**
 * Returns true if two steps target the same goal (description, target, or url).
 */
function isSameStepGoal(stepA, stepB) {
  if (!stepA || !stepB) return false;

  const clean = (str) => (str || '').toString().trim().toLowerCase().replace(/[.!?]+$/, '');

  const targetA = clean(stepA.target || stepA.args?.targetDescription);
  const targetB = clean(stepB.target || stepB.args?.targetDescription);
  if (targetA && targetB && targetA === targetB) return true;

  const descA = clean(stepA.description || stepA.intent);
  const descB = clean(stepB.description || stepB.intent);
  if (descA && descB && descA === descB) return true;

  const urlA = clean(stepA.url || stepA.args?.url);
  const urlB = clean(stepB.url || stepB.args?.url);
  if (urlA && urlB && urlA === urlB) return true;

  const rawA = targetA || descA || urlA || '';
  const rawB = targetB || descB || urlB || '';
  return Boolean(rawA && rawA === rawB);
}

// ─── Known websites ─────────────────────────────────────────────────────────
const SITES = {
  youtube:     'https://www.youtube.com',
  google:      'https://www.google.com',
  twitter:     'https://www.twitter.com',
  reddit:      'https://www.reddit.com',
  amazon:      'https://www.amazon.com',
  netflix:     'https://www.netflix.com',
  github:      'https://www.github.com',
  instagram:   'https://www.instagram.com',
  linkedin:    'https://www.linkedin.com',
  wikipedia:   'https://www.wikipedia.org',
  facebook:    'https://www.facebook.com',
  tiktok:      'https://www.tiktok.com',
  spotify:     'https://open.spotify.com',
  discord:     'https://discord.com',
  bing:        'https://www.bing.com',
  duckduckgo:  'https://duckduckgo.com',
  stackoverflow: 'https://stackoverflow.com',
  medium:      'https://medium.com',
  notion:      'https://www.notion.so',
  figma:       'https://www.figma.com',
  canva:       'https://www.canva.com',
  vercel:      'https://vercel.com',
  cloudflare:  'https://www.cloudflare.com',
  ebay:        'https://www.ebay.com',
  flipkart:    'https://www.flipkart.com',
};

/**
 * Returns true when the user wants Actra to read the page and report back in chat.
 * e.g. "tell me", "summarize", "what is", "give me info", "explain"
 */
function isReadAndReportCommand(command) {
  const t = (command || '').trim();
  return /\b(tell (me|the information|me about|me what)|summarize|give me (a summary|info|information|details)|explain|what (is|are|does)|read (it|this|the page|the article)|report back|what.?s on|inform me|share the (content|info|details))\b/i.test(t);
}

/**
 * Returns true when the user wants to solve MCQs / a quiz using UI-TARS vision.
 * Triggers the screenshot→analyze→click→next agentic loop.
 * e.g. "solve mcqs", "answer all questions", "select options and click next",
 *      "solve all mcqs one by one from tab one", "do the quiz on tab 1"
 */
function isMcqCommand(command) {
  const t = (command || '').trim();
  return /\b(solve (the |all |these |this )?(mcq|mcqs|quiz|questions?|exam|test)|answer (the |all |these |this )?(mcq|mcqs|questions?|options?)|select (the |all )?(options?|answers?)|auto(matically)? (solve|answer|select)|do (the |this )?(quiz|test|exam|questions?)|click (options?|answers?) (and|then) (next|submit)|attempt (the |this )?(quiz|test|exam))\b/i.test(t)
    // Also catch: "solve mcqs from tab one", "tab 1 mcqs", "one by one" quiz phrasing
    || /\b(mcq|mcqs|quiz|questions?)\b.*\b(tab (one|1|two|2|three|3|four|4|five|5))/i.test(t)
    || /\b(tab (one|1|two|2|three|3|four|4|five|5))\b.*\b(mcq|mcqs|quiz|questions?|solve|answer|attempt)/i.test(t)
    || (/\bone by one\b/i.test(t) && /\b(mcq|mcqs|quiz|question|answer|option|tab)/i.test(t))
    || /\b(mcq|mcqs|quiz|question|answer|option)\b.*\bone by one\b/i.test(t)
    || /\b(solve|answer)\b.*\b(one by one|one-by-one)\b/i.test(t)
    || /\b(solve|answer)\b.*\b(mcq|mcqs|quiz)\b/i.test(t);
}

// ─── Rule-based Task Decomposer ─────────────────────────────────────────────
class TaskDecomposer {
  /**
   * Attempt to decompose a command into a step plan without any LLM call.
   * Returns { summary, steps } or null if no pattern matched.
   */
  static decompose(command) {
    const c = command.trim();

    // 1. Raw URL in command → just navigate
    const urlMatch = c.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      return {
        summary: `Navigate to ${urlMatch[0]}`,
        steps: [
          { type: 'navigate', url: urlMatch[0] },
          { type: 'wait', ms: 2000 },
        ],
      };
    }

    // 2. "open/go to [site] and play/search/find [query]"
    //    e.g. "open youtube and play mr beast"
    const compoundMatch = c.match(
      /\b(?:open|go\s+to|navigate\s+to|visit|launch|load)\s+(\w+)\b.*?\band\s+(?:play|search(?:\s+for)?|find|watch|look\s+up)\s+(.+)$/i
    );
    if (compoundMatch) {
      const siteName = compoundMatch[1].toLowerCase();
      const query    = compoundMatch[2].trim().replace(/[.!?]$/, '');
      if (SITES[siteName]) {
        return TaskDecomposer._buildSearchPlan(siteName, query, c);
      }
    }

    // 2b. "open [site] search about/for [query]" or "search [query] in/on [site]"
    //     e.g. "open wikipedia search about tigers", "open youtube search for mr beast"
    const openSearchMatch = c.match(
      /\b(?:open|go\s+to|visit|launch)\s+(\w+)\s+(?:search|search\s+(?:about|for|on))\s+(.+)$/i
    );
    if (openSearchMatch) {
      const siteName = openSearchMatch[1].toLowerCase();
      const query    = openSearchMatch[2].trim().replace(/[.!?]$/, '');
      if (SITES[siteName]) {
        return TaskDecomposer._buildSearchPlan(siteName, query, c);
      }
    }

    // 3. "[play/search/watch/find] [query] on/in [site]"
    //    e.g. "play mr beast on youtube", "search tigers in wikipedia"
    const onSiteMatch = c.match(
      /\b(?:play|search(?:\s+for)?|watch|find|look\s+up)\s+(.+?)\s+(?:on|in|at)\s+(\w+)\b/i
    );
    if (onSiteMatch) {
      const query    = onSiteMatch[1].trim().replace(/[.!?]$/, '');
      const siteName = onSiteMatch[2].toLowerCase();
      if (SITES[siteName]) {
        return TaskDecomposer._buildSearchPlan(siteName, query, c);
      }
    }

    // 4. "search [query]" / "search for [query]" without site → Google
    const searchMatch = c.match(/^\s*search(?:\s+for)?\s+(.+)$/i);
    if (searchMatch) {
      const query = searchMatch[1].trim().replace(/[.!?]$/, '');
      const url   = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      return {
        summary: `Search Google for "${query}"`,
        steps: [
          { type: 'navigate', url },
          { type: 'wait', ms: 2000 },
        ],
      };
    }

    // 5. "play [query]" without site → YouTube
    const playMatch = c.match(/^\s*(?:play|watch)\s+(.+)$/i);
    if (playMatch) {
      const query = playMatch[1].trim().replace(/[.!?]$/, '');
      return TaskDecomposer._buildSearchPlan('youtube', query, c);
    }

    // 6. "open/go to/visit [site]" — pure navigation
    for (const [name, url] of Object.entries(SITES)) {
      const navRe = new RegExp(
        `\\b(?:open|go\\s+to|navigate\\s+to|visit|launch|load|show)\\s+${name}\\b`, 'i'
      );
      if (navRe.test(c)) {
        return {
          summary: `Open ${name.charAt(0).toUpperCase() + name.slice(1)}`,
          steps: [
            { type: 'navigate', url },
            { type: 'wait', ms: 2000 },
          ],
        };
      }
    }

    // 7. Bare site name alone  e.g. "youtube", "github.com"
    for (const [name, url] of Object.entries(SITES)) {
      if (new RegExp(`^${name}\\.?(?:com|org|io|net)?$`, 'i').test(c.trim())) {
        return {
          summary: `Open ${name}`,
          steps: [
            { type: 'navigate', url },
            { type: 'wait', ms: 2000 },
          ],
        };
      }
    }

    // 8. No pattern matched
    return null;
  }

  /**
   * Appends an extract_and_report step to a plan if the command signals
   * that the user wants the content reported back in the chat.
   */
  static maybeAddExtract(plan, command) {
    if (!plan || !isReadAndReportCommand(command)) return plan;
    // Don't add extraction to media/shopping sites where it's not useful
    const noExtract = /\b(youtube|spotify|netflix|amazon|tiktok|instagram|facebook|twitter)\b/i;
    if (noExtract.test(command)) return plan;
    return {
      ...plan,
      steps: [
        ...plan.steps,
        { type: 'extract_and_report', intent: command },
      ],
    };
  }

  /**
   * Last-resort heuristic: extract a URL or site name and return a minimal navigate plan.
   * Used when LLM planning also fails.
   */
  static inferFallback(command) {
    for (const [name, url] of Object.entries(SITES)) {
      if (new RegExp(`\\b${name}\\b`, 'i').test(command)) {
        return {
          summary: `Open ${name}`,
          steps: [
            { type: 'navigate', url },
            { type: 'wait', ms: 2000 },
          ],
        };
      }
    }
    return null;
  }

  /** Build a search+interact plan for a given site and query. */
  static _buildSearchPlan(siteName, query, originalCommand) {
    const isPlay   = /\bplay\b|\bwatch\b/i.test(originalCommand);
    const siteUrl  = SITES[siteName];

    if (siteName === 'youtube') {
      return {
        summary: `${isPlay ? 'Play' : 'Search'} "${query}" on YouTube`,
        steps: [
          { type: 'navigate', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}` },
          { type: 'wait', ms: 3000 },
          ...(isPlay ? [{ type: 'click', target: 'first video result' }] : []),
        ],
      };
    }

    if (siteName === 'spotify') {
      return {
        summary: `Play "${query}" on Spotify`,
        steps: [
          { type: 'navigate', url: 'https://open.spotify.com/search' },
          { type: 'wait', ms: 2500 },
          { type: 'type',      target: 'search input', text: query },
          { type: 'press_key', key: 'Enter' },
          { type: 'wait', ms: 2000 },
        ],
      };
    }

    if (siteName === 'google') {
      return {
        summary: `Search Google for "${query}"`,
        steps: [
          { type: 'navigate', url: `https://www.google.com/search?q=${encodeURIComponent(query)}` },
          { type: 'wait', ms: 2000 },
        ],
      };
    }

    if (siteName === 'reddit') {
      return {
        summary: `Search Reddit for "${query}"`,
        steps: [
          { type: 'navigate', url: `https://www.reddit.com/search/?q=${encodeURIComponent(query)}` },
          { type: 'wait', ms: 2000 },
        ],
      };
    }

    if (siteName === 'amazon') {
      return {
        summary: `Search Amazon for "${query}"`,
        steps: [
          { type: 'navigate', url: `https://www.amazon.com/s?k=${encodeURIComponent(query)}` },
          { type: 'wait', ms: 2000 },
        ],
      };
    }

    if (siteName === 'github') {
      return {
        summary: `Search GitHub for "${query}"`,
        steps: [
          { type: 'navigate', url: `https://github.com/search?q=${encodeURIComponent(query)}` },
          { type: 'wait', ms: 2000 },
        ],
      };
    }

    if (siteName === 'wikipedia') {
      // Direct Wikipedia article URL — much better than typing in the search box
      return {
        summary: `Search Wikipedia for "${query}"`,
        steps: [
          { type: 'navigate', url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(query)}&go=Go` },
          { type: 'wait', ms: 2500 },
        ],
      };
    }

    if (siteName === 'stackoverflow') {
      return {
        summary: `Search Stack Overflow for "${query}"`,
        steps: [
          { type: 'navigate', url: `https://stackoverflow.com/search?q=${encodeURIComponent(query)}` },
          { type: 'wait', ms: 2000 },
        ],
      };
    }

    // Generic: navigate to site and use its search box
    return {
      summary: `Search "${query}" on ${siteName}`,
      steps: [
        { type: 'navigate', url: siteUrl },
        { type: 'wait', ms: 2500 },
        { type: 'type',      target: 'search input', text: query },
        { type: 'press_key', key: 'Enter' },
        { type: 'wait', ms: 2000 },
      ],
    };
  }
}

// ─── BrowserAgent ────────────────────────────────────────────────────────────
class BrowserAgent {
  constructor(deps) {
    this.tabManager              = deps.tabManager;
    this.taskManager             = deps.taskManager;
    this.chatManager             = deps.chatManager;
    this.auditLog                = deps.auditLog;
    this.modelGateway            = deps.modelGateway;
    this.getLocalVisionServer    = deps.getLocalVisionServer;
    this.getLocalModelManager    = deps.getLocalModelManager;
    this.browserInteractionEngine = deps.browserInteractionEngine;
    this.pageContextEngine        = deps.pageContextEngine || (PageContextEngine ? new PageContextEngine(this.tabManager) : null);
    // Unified grounding router — single entrypoint for all element resolution
    this.groundingRouter          = deps.groundingRouter || null;
    this.planner                  = deps.planner || deps.plannerEngine || null;
    if (!this.planner && PlannerEngine && this.modelGateway) {
      this.planner = new PlannerEngine(this.modelGateway);
    }
    // Optional approval engine for low-confidence MCQ gates
    this._approvalEngine          = deps.approvalEngine || null;

    // Pre-warm local vision server in background if configured
    this._prewarmVisionServer();
  }

  _prewarmVisionServer() {
    try {
      const vs = this.getLocalVisionServer && this.getLocalVisionServer();
      if (vs && typeof vs.prewarm === 'function') {
        vs.prewarm();
      }
    } catch (_) {}
  }

  /**
   * Normalizes a step object from either TaskDecomposer schema or PlannerEngine
   * into standard { type, target, text, url, ms, key, amount, intent, ... }.
   */
  _normalizeStep(step) {
    if (!step) return step;
    const s = { ...step };
    if (s.action) {
      if (s.action === 'browser_navigate' || s.action === 'navigate') {
        s.type = 'navigate';
        s.url = s.url || s.args?.url;
      } else if (s.action === 'browser_type' || s.action === 'type') {
        s.type = 'type';
        s.target = s.target || s.args?.targetDescription || s.args?.target;
        s.text = s.text != null ? s.text : s.args?.text;
      } else if (s.action === 'browser_click' || s.action === 'click') {
        s.type = 'click';
        s.target = s.target || s.args?.targetDescription || s.args?.target;
      } else if (s.action === 'browser_press_key' || s.action === 'press_key') {
        s.type = 'press_key';
        s.key = s.key || s.args?.key;
      } else if (s.action === 'browser_scroll' || s.action === 'scroll') {
        s.type = 'scroll';
        s.amount = s.amount != null ? s.amount : s.args?.amount;
      } else if (s.action === 'browser_extract_page_text' || s.action === 'extract_and_report') {
        s.type = 'extract_and_report';
        s.intent = s.intent || s.description;
      } else if (s.action === 'wait') {
        s.type = 'wait';
        s.ms = s.ms || s.args?.ms || 1000;
      } else if (s.action === 'visual_interact') {
        s.type = 'visual_interact';
        s.intent = s.intent || s.args?.intent || s.description;
      } else {
        s.type = s.action.replace(/^browser_/, '');
        if (s.args?.targetDescription && !s.target) s.target = s.args.targetDescription;
      }
    }
    if (s.preferVision === undefined && s.args?.preferVision !== undefined) {
      s.preferVision = Boolean(s.args.preferVision);
    }
    return s;
  }

  /**
   * Captures the current page state for replanning.
   */
  async _getPageContext(tabId) {
    if (this.pageContextEngine) {
      try {
        const ctxPromise = this.pageContextEngine.getContext(tabId);
        return await Promise.race([
          ctxPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('pageContext timeout')), 4000)),
        ]);
      } catch (err) {
        console.warn('[BrowserAgent] Failed to capture full page context:', err.message);
      }
    }
    const view = this.tabManager?.tabs?.get(tabId);
    return {
      url: view?.webContents?.getURL() || 'about:blank',
      title: view?.webContents?.getTitle() || 'unknown',
      elements: [],
    };
  }

  async execute(command, activeTabId, task, assistantMsg, auditEntryId, mcqModel) {
    // Determine which tab to target.
    // Supports explicit tab instructions e.g. "from tab 1", "tab 2", "tab one", etc.
    let targetTabId = activeTabId || this.tabManager.activeTabId;
    let explicitTabSpecified = false;
    const tabMatch = (command || '').match(/\btab\s*(?:(?:number|#)\s*)?(\d+|one|two|three|four|five|six|seven|eight|nine)\b/i);
    if (tabMatch) {
      const tabNumMap = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
      const parsedNum = parseInt(tabMatch[1], 10) || tabNumMap[tabMatch[1].toLowerCase()] || 1;
      const tabIndex = Math.max(0, parsedNum - 1);
      if (this.tabManager.tabOrder && this.tabManager.tabOrder[tabIndex]) {
        targetTabId = this.tabManager.tabOrder[tabIndex];
        explicitTabSpecified = true;
      }
    } else if (!targetTabId && this.tabManager.tabOrder?.[0]) {
      targetTabId = this.tabManager.tabOrder[0];
    }

    if (!this.tabManager.tabs.has(targetTabId)) {
      targetTabId = this.tabManager.activeTabId || this.tabManager.tabOrder?.[0];
    }

    if (!this.tabManager.tabs.has(targetTabId)) {
      throw new Error('Tab is not available or closed.');
    }

    this.taskManager.updateTaskStatus(task.id, 'executing');
    this._prewarmVisionServer();

    // ── Phase 0: Pronoun resolution (zero LLM if no pronouns detected) ──────
    command = await this._resolvePronouns(command);

    // ── Phase 0.5: MCQ routing — sequential or batch ──────────────────────────
    if (isMcqCommand(command)) {
      // 1. Dynamic MCQ Tab Discovery: if user didn't specify a tab (e.g. "from tab 2"),
      // check if targetTabId has MCQs. If not, inspect other open tabs to find the quiz tab.
      if (!explicitTabSpecified) {
        const mcqTab = await this._findMcqTab(targetTabId);
        if (mcqTab?.tabId && mcqTab.tabId !== targetTabId && mcqTab.hasMCQs) {
          console.log(`[BrowserAgent] Switching to tab with MCQs: ${mcqTab.tabId} ("${mcqTab.title}" - ${mcqTab.url})`);
          targetTabId = mcqTab.tabId;
          this.tabManager.setActiveTab(targetTabId);
          const v = this.tabManager.tabs.get(targetTabId);
          if (v) {
            try { this.tabManager.updateViewBounds(v); } catch {}
            try { v.webContents.focus(); } catch {}
          }
          this.taskManager.addStep(
            task.id,
            `📑 Located MCQ quiz in tab: "${mcqTab.title || targetTabId}" — switched tab`,
            'completed',
            'navigate'
          );
        }
      } else {
        this.tabManager.setActiveTab(targetTabId);
        const v = this.tabManager.tabs.get(targetTabId);
        if (v) {
          try { this.tabManager.updateViewBounds(v); } catch {}
          try { v.webContents.focus(); } catch {}
        }
        const activeIdx = this.tabManager.tabOrder ? this.tabManager.tabOrder.indexOf(targetTabId) + 1 : 1;
        this.taskManager.addStep(
          task.id,
          `📑 Targeting Tab ${activeIdx} for MCQ solving`,
          'completed',
          'navigate'
        );
      }

      // Invalidate detection cache now that we're handling a fresh request
      if (this.pageContextEngine?.clearMCQDetectionCache) {
        this.pageContextEngine.clearMCQDetectionCache(targetTabId);
      }

      // Detect quiz mode details
      const seqDetect = this.pageContextEngine?.detectSequentialQuizMode
        ? await this.pageContextEngine.detectSequentialQuizMode(targetTabId).catch(() => ({ isSequential: true, optionCount: 0, timerText: '' }))
        : { isSequential: true, optionCount: 0, timerText: '' };

      // Route all MCQ commands to the continuous quiz solver that loops through all questions,
      // captures screenshot previews for the chat, and answers fast via DOM + LLM
      await this._solveSequentialQuiz(targetTabId, task, assistantMsg, auditEntryId, command, seqDetect, mcqModel);
      return;
    }

    let plan = TaskDecomposer.decompose(command);
    // Append extract_and_report step if user wants info summarized to chat
    if (plan) plan = TaskDecomposer.maybeAddExtract(plan, command);

    if (plan) {
      console.log(`[BrowserAgent] Rule-based plan: ${plan.summary} (${plan.steps.length} steps)`);
      this.taskManager.addStep(task.id, `📋 ${plan.summary}`, 'completed', 'plan');
    } else {
      // ── Phase 2: LLM fallback for complex / unknown tasks ────────────
      const planStep = this.taskManager.addStep(task.id, '🧠 Planning browser actions…', 'running', 'plan');
      let currentUrl = 'about:blank';
      try {
        const view = this.tabManager.tabs.get(targetTabId);
        currentUrl = view?.webContents?.getURL() || 'about:blank';
      } catch {}

      const planSchema = {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type:   { type: 'string', enum: ['navigate', 'type', 'click', 'press_key', 'wait', 'visual_interact'] },
                url:    { type: 'string' },
                target: { type: 'string' },
                text:   { type: 'string' },
                key:    { type: 'string' },
                ms:     { type: 'number' },
                intent: { type: 'string' },
              },
              required: ['type'],
            },
          },
        },
        required: ['summary', 'steps'],
      };

      try {
        const { data } = await this.modelGateway.structuredOutput(
          `Current URL: ${currentUrl}\nTask: "${command}"\n\nOutput a browser action plan as JSON.`,
          planSchema,
          {
            temperature: 0.1,
            systemInstruction:
              'Browser action planner. Step types: navigate(url), type(target,text), click(target), press_key(key), wait(ms), visual_interact(intent for MCQs/coding/captchas). ' +
              'Always include wait(2000) after navigate. Keep steps minimal. Return ONLY valid JSON.',
          }
        );
        if (data?.steps?.length) {
          plan = data;
          this.taskManager.updateStep(task.id, planStep.id, 'completed', plan.summary || `${plan.steps.length} step(s) planned`);
        } else {
          throw new Error('LLM returned empty plan');
        }
      } catch (llmErr) {
        // ── Phase 3: Last-resort heuristic fallback ────────────────────
        console.warn('[BrowserAgent] LLM plan failed, trying heuristic fallback:', llmErr.message);
        plan = TaskDecomposer.inferFallback(command);
        if (plan) {
          this.taskManager.updateStep(task.id, planStep.id, 'completed', `Fallback: ${plan.summary}`);
        } else {
          this.taskManager.updateStep(task.id, planStep.id, 'failed', llmErr.message);
          throw new Error(`Could not plan the task: ${llmErr.message}`);
        }
      }
    }

    // ── Phase 4: Execute each step via DOM (with replan on verified_failed) ────
    let currentSteps = plan.steps.map(s => this._normalizeStep(s));
    let currentPlanSummary = plan.summary;
    let stepIndex = 0;
    let replanCount = 0;
    let lastFailedStep = null;
    const executionHistory = [];

    while (stepIndex < currentSteps.length) {
      if (this.taskManager.getTask(task.id)?.status === 'cancelled') break;
      const step = currentSteps[stepIndex];

      try {
        const result = await this.executeStep(targetTabId, step, task);

        // Record successful step in execution history
        const stepAction = step.action || (step.type ? (step.type.startsWith('browser_') ? step.type : `browser_${step.type}`) : 'browser_action');
        const targetStr = step.target || step.args?.targetDescription ? ` (${step.target || step.args?.targetDescription})` : '';
        executionHistory.push({
          action: `${stepAction}${targetStr}`,
          result: typeof result === 'string' ? result.slice(0, 200) : 'completed',
        });

        // If this step matched the previously failed goal and succeeded, clear lastFailedStep
        if (lastFailedStep && isSameStepGoal(step, lastFailedStep)) {
          lastFailedStep = null;
        }

        // extract_and_report returns the final answer — post it and stop
        if (step.type === 'extract_and_report' && result) {
          this.taskManager.updateTaskStatus(task.id, 'completed', { outputs: result });
          if (assistantMsg?.id) {
            await this.chatManager.updateMessage(assistantMsg.id, { content: result });
          }
          this.auditLog.updateEntry(auditEntryId, { execution_status: 'success', execution_result: result });
          return;
        }

        stepIndex++;
      } catch (err) {
        const isVerifiedFailed = err.message && err.message.startsWith('verified_failed:');
        if (!isVerifiedFailed) {
          // Unhandled non-verification error (tab closed, fatal network error) — abort immediately
          throw err;
        }

        const reason = err.message.replace(/^verified_failed:\s*/, '').trim();

        // 1. Only hard-abort if the SAME step goal fails verification twice in a row after a replan
        if (lastFailedStep && isSameStepGoal(step, lastFailedStep)) {
          console.warn(`[BrowserAgent] Same step goal "${step.target || step.description}" failed verification twice in a row after replan. Hard aborting.`);
          const failMsg = `verified_failed: ${reason}`;
          this.taskManager.updateTaskStatus(task.id, 'failed', { error: failMsg });
          if (assistantMsg?.id) {
            await this.chatManager.updateMessage(assistantMsg.id, { content: `❌ Task failed: ${reason}` });
          }
          this.auditLog?.updateEntry(auditEntryId, { execution_status: 'failed', error: failMsg });
          throw new Error(failMsg);
        }

        // 2. Cap total replans per task at 3
        if (replanCount >= 3) {
          const maxErr = 'exceeded max recovery attempts';
          console.warn(`[BrowserAgent] Replan limit reached (3). Failing task.`);
          this.taskManager.updateTaskStatus(task.id, 'failed', { error: maxErr });
          if (assistantMsg?.id) {
            await this.chatManager.updateMessage(assistantMsg.id, { content: `❌ ${maxErr}` });
          }
          this.auditLog?.updateEntry(auditEntryId, { execution_status: 'failed', error: maxErr });
          throw new Error(maxErr);
        }

        // 3. Mark step verified_failed (already marked in executeStep)
        // Record lastFailedStep and increment replanCount
        lastFailedStep = step;
        replanCount++;

        // 4. Capture current page state
        const pageContext = await this._getPageContext(targetTabId);

        // 5. Explicitly note "step X failed verification: <reason>" in executionHistory
        const stepAction = step.action || (step.type ? (step.type.startsWith('browser_') ? step.type : `browser_${step.type}`) : 'browser_action');
        const targetStr = step.target || step.args?.targetDescription ? ` (${step.target || step.args?.targetDescription})` : '';
        const failMessage = `step ${stepIndex + 1} failed verification: ${reason}`;
        executionHistory.push({
          action: `${stepAction}${targetStr}`,
          result: failMessage,
        });

        // 6. Give planner a chance to recover
        if (!this.planner) {
          const noPlannerErr = `verified_failed: ${reason} (no planner available to recover)`;
          this.taskManager.updateTaskStatus(task.id, 'failed', { error: noPlannerErr });
          throw new Error(noPlannerErr);
        }

        const replanStep = this.taskManager.addStep(
          task.id,
          `🔄 Replanning after verification failure (Attempt ${replanCount}/3)…`,
          'running',
          'plan'
        );

        let newPlan = null;
        try {
          let chatHistory = [];
          try {
            if (this.chatManager?.getHistory) {
              chatHistory = (await this.chatManager.getHistory()).slice(-5);
            }
          } catch (_) {}

          const understanding = { intent: command, goal: command };
          newPlan = await this.planner.createPlan(
            understanding,
            pageContext,
            BROWSER_PLANNER_TOOLS,
            chatHistory,
            executionHistory
          );
          this.taskManager.updateStep(
            task.id,
            replanStep.id,
            'completed',
            newPlan?.interpretation || `Revised plan with ${newPlan?.steps?.length || 0} step(s)`
          );
        } catch (planErr) {
          this.taskManager.updateStep(task.id, replanStep.id, 'failed', planErr.message);
          this.taskManager.updateTaskStatus(task.id, 'failed', { error: `Replanning failed: ${planErr.message}` });
          throw planErr;
        }

        if (!newPlan?.steps?.length) {
          const emptyErr = `verified_failed: planner could not generate revised plan after step failed: ${reason}`;
          this.taskManager.updateTaskStatus(task.id, 'failed', { error: emptyErr });
          throw new Error(emptyErr);
        }

        // Replace remaining steps with the revised plan from actual current state
        currentSteps = newPlan.steps.map(s => {
          const norm = this._normalizeStep(s);
          // Prefer vision on replan after verification failure to avoid repeating DOM traps
          norm.preferVision = true;
          return norm;
        });
        currentPlanSummary = newPlan.interpretation || currentPlanSummary;
        stepIndex = 0;
      }
    }

    await this.finish(task.id, assistantMsg?.id, auditEntryId, currentPlanSummary || plan.summary || 'Task completed.');
  }

  // ── Step executor: DOM-first, vision fallback for visual_interact ─────
  async executeStep(tabId, step, task) {
    step = this._normalizeStep(step);
    const view = this.tabManager.tabs.get(tabId);
    if (!view) throw new Error('Tab was closed during execution.');

    const labels = {
      navigate:        `🌐 Navigating to ${step.url || '…'}`,
      type:            `⌨️  Typing "${(step.text || '').slice(0, 40)}" into ${step.target || 'element'}`,
      click:           `🖱️  Clicking ${step.target || 'element'}`,
      press_key:       `⌨️  Pressing ${step.key}`,
      wait:            `⏳ Waiting ${step.ms || 1000}ms`,
      scroll:          `📜 Scrolling page`,
      visual_interact: `👁️  Visual: ${step.intent || step.text || '…'}`,
    };
    const stepLabel = step.description || labels[step.type] || `▶ ${step.type}`;
    const stepEntry = this.taskManager.addStep(
      task.id, stepLabel, 'running', 'execute'
    );

    // ── Fix 1: Hard step-level timeout wrapper ─────────────────────────────────
    // Wraps the entire step execution (grounding + click/type + verify + retry).
    // If the timeout fires we emit a verified_failed error so it routes into the
    // existing replan/recovery flow — no new code paths needed.
    // Bumped to 35s when preferVision or visual_interact is expected to allow vision
    // models (or local vision server) sufficient execution budget.
    const STEP_TIMEOUT_MS = (step.preferVision || step.type === 'visual_interact') ? 35000 : 20000;
    let subStage = 'init'; // tracks which sub-stage was in flight when timeout fires
    let stepTimeoutHandle;
    const stepTimeoutPromise = new Promise((_res, rej) => {
      stepTimeoutHandle = setTimeout(() => {
        console.error(`[BrowserAgent] Step timeout (${STEP_TIMEOUT_MS}ms) fired during sub-stage="${subStage}" for step type="${step.type}" target="${step.target || step.url || '?'}".`);
        rej(new Error(`verified_failed: step timed out after ${STEP_TIMEOUT_MS}ms (sub-stage: ${subStage})`));
      }, STEP_TIMEOUT_MS);
    });

    try {
      const result = await Promise.race([stepTimeoutPromise, this._executeStepBody(tabId, step, task, view, stepEntry, () => subStage, (s) => { subStage = s; })]);
      clearTimeout(stepTimeoutHandle);
      return result;
    } catch (err) {
      clearTimeout(stepTimeoutHandle);
      // Mark the step if not already marked
      if (err.message?.startsWith('verified_failed:')) {
        try { this.taskManager.updateStep(task.id, stepEntry.id, 'verified_failed', err.message.replace(/^verified_failed:\s*/, '')); } catch {}
      }
      throw err;
    }
  }

  // ── Fix 2: Navigation-intent detector ────────────────────────────────────────
  // Returns true when the step's target description or explicit flag suggests
  // the click is expected to cause a page/URL transition.
  _detectsNavigation(step) {
    if (step.causesNavigation === true) return true;
    const desc = (step.target || step.intent || step.description || '').toLowerCase();
    return /\b(video|result|link|open|article|product|watch|href|navigate|go to|visit|read)\b/.test(desc);
  }

  // ── Poll for URL change (SPA pushState + full navigations) ───────────────────
  // Resolves true when the URL differs from beforeUrl within timeoutMs.
  async _pollUrlChanged(tabId, beforeUrl, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 250));
      try {
        const view = this.tabManager.tabs.get(tabId);
        if (!view) return false;
        const now = view.webContents.getURL();
        if (now && now !== beforeUrl) return true;
      } catch { return false; }
    }
    return false;
  }

  // ── Internal step body (separated so it can race against the timeout) ────────
  async _executeStepBody(tabId, step, task, view, stepEntry, getSubStage, setSubStage) {
    try {
      switch (step.type) {
        case 'navigate': {

          let url = (step.url || '').trim();
          if (url && !url.startsWith('http')) url = 'https://' + url;
          if (!url) throw new Error('navigate step is missing a url');

          try {
            await view.webContents.loadURL(url);
          } catch (navErr) {
            // Electron throws ERR_ABORTED (-3) on redirects (e.g. YouTube themeRefresh or HTTP 301/302/307)
            if (!navErr.message?.includes('ERR_ABORTED') && !navErr.message?.includes('-3')) {
              throw navErr;
            }
          }

          // Wait up to 10s for page to settle after redirects
          await new Promise(resolve => {
            let done = false;
            const finish = () => { if (!done) { done = true; resolve(); } };
            if (!view.webContents.isLoading()) {
              finish();
            } else {
              view.webContents.once('did-stop-loading', finish);
              setTimeout(finish, 10000);
            }
          });

          // Buffer for SPA hydration
          await new Promise(r => setTimeout(r, 800));

          // Invalidate grounding cache when domain changes after navigation
          if (this.groundingRouter) {
            try {
              const newUrl = view.webContents.getURL();
              const newDomain = new URL(newUrl).hostname;
              this.groundingRouter.invalidateDomain(newDomain);
            } catch (_) {}
          }
          break;
        }

        case 'type': {
          // Use GroundingRouter when available (DOM → LLM → Vision pipeline)
          if (this.groundingRouter) {
            let grounded = null;
            for (let attempt = 0; attempt < 3; attempt++) {
              const pageCtx = { url: view.webContents.getURL() };
              grounded = await this.groundingRouter.resolveElement(
                tabId,
                step.target || '',
                pageCtx,
                'type',
                { preferVision: Boolean(step.preferVision) }
              );
              if (grounded.strategy !== 'failed') break;
              await new Promise(r => setTimeout(r, 800));
            }

            // ── Snapshot before action ─────────────────────────────────────
            const typeBeforeSnap = (grounded && grounded.elementId)
              ? await this._snapshotElement(tabId, grounded.elementId)
              : null;

            if (grounded && grounded.elementId) {
              await this.browserInteractionEngine.typeText(tabId, grounded.elementId, step.text || '');
            } else if (grounded && grounded.coords) {
              await this.browserInteractionEngine.typeAt(tabId, grounded.coords.x, grounded.coords.y, step.text || '');
            } else {
              // Last resort: inject into whatever is focused
              view.webContents.insertText(step.text || '');
              await new Promise(r => setTimeout(r, 300));
            }

            // ── Post-condition: verify DOM state changed ───────────────────
            if (grounded && grounded.elementId) {
              const typeChanged = await this._pollElementChanged(tabId, grounded.elementId, typeBeforeSnap, 3000);
              if (!typeChanged) {
                const pageUrl2  = view.webContents.getURL();
                const domain2   = this._domainOf(pageUrl2);
                this.groundingRouter.invalidateCacheKey(domain2, step.target || '', 'type');
                const nextStrat = this.groundingRouter.getNextStrategy(grounded.strategy);
                let retryOk = false;
                if (nextStrat) {
                  const retried = await this.groundingRouter._runStrategy(nextStrat, tabId, step.target || '', 'type');
                  if (retried && retried.elementId) {
                    const retryBefore = await this._snapshotElement(tabId, retried.elementId);
                    await this.browserInteractionEngine.typeText(tabId, retried.elementId, step.text || '');
                    retryOk = await this._pollElementChanged(tabId, retried.elementId, retryBefore, 3000);
                  }
                }
                if (!retryOk) {
                  this.taskManager.updateStep(task.id, stepEntry.id, 'verified_failed',
                    'Typed but input value did not change (no state change detected)');
                  throw new Error('verified_failed: type action produced no observable DOM change');
                }
              }
            }
          } else {
            // Legacy path (no router injected)
            let elementId = null;
            for (let attempt = 0; attempt < 5; attempt++) {
              const res = await this.browserInteractionEngine.resolveElementLocally(
                tabId, step.target || '', 'browser_type'
              );
              elementId = res.elementId;
              if (elementId) break;
              await new Promise(r => setTimeout(r, 800));
            }
            if (elementId) {
              await this.browserInteractionEngine.typeText(tabId, elementId, step.text || '');
            } else {
              view.webContents.insertText(step.text || '');
              await new Promise(r => setTimeout(r, 300));
            }
          }
          break;
        }

        case 'click': {
          // Use GroundingRouter when available (DOM → LLM → Vision pipeline)
          if (this.groundingRouter) {
            let grounded = null;
            setSubStage('grounding');
            for (let attempt = 0; attempt < 3; attempt++) {
              const pageCtx = { url: view.webContents.getURL() };
              grounded = await this.groundingRouter.resolveElement(
                tabId,
                step.target || '',
                pageCtx,
                'click',
                { preferVision: Boolean(step.preferVision) }
              );
              if (grounded.strategy !== 'failed') break;
              await new Promise(r => setTimeout(r, 800));
            }
            if (!grounded || grounded.strategy === 'failed') {
              throw new Error(`Cannot find element: "${step.target}"`);
            }

            // ── Snapshot + pre-URL before action ──────────────────────────
            setSubStage('pre-click-snapshot');
            const clickBeforeSnap = grounded.elementId
              ? await this._snapshotElement(tabId, grounded.elementId)
              : null;
            const clickBeforeUrl = view.webContents.getURL();

            setSubStage('click-dispatch');
            if (grounded.elementId) {
              await this.browserInteractionEngine.clickElement(tabId, grounded.elementId);
            } else if (grounded.coords) {
              await this.browserInteractionEngine.clickAt(tabId, grounded.coords.x, grounded.coords.y);
            }

            // ── Fix 2: Post-condition — DOM change AND/OR URL change ───────
            setSubStage('post-condition-verify');
            const isNavClick = this._detectsNavigation(step);
            if (grounded.elementId) {
              // Run DOM poll (and optionally URL poll) concurrently
              const domPoll = this._pollElementChanged(tabId, grounded.elementId, clickBeforeSnap, 3000);
              const urlPoll = isNavClick
                ? this._pollUrlChanged(tabId, clickBeforeUrl, 4000)
                : Promise.resolve(false);

              const clickChanged = await Promise.race([
                domPoll.then(v => ({ kind: 'dom', ok: v })),
                urlPoll.then(v => ({ kind: 'url', ok: v })),
              ]).then(winner => {
                // If the winning poll says true we're done; otherwise wait for the other
                if (winner.ok) return true;
                // Loser might still succeed — race with a tiny extra window
                return Promise.race([domPoll, urlPoll]);
              });

              if (!clickChanged) {
                setSubStage('retry-grounding');
                const pageUrl2  = view.webContents.getURL();
                const domain2   = this._domainOf(pageUrl2);
                this.groundingRouter.invalidateCacheKey(domain2, step.target || '', 'click');
                const nextStrat = this.groundingRouter.getNextStrategy(grounded.strategy);
                let retryOk = false;
                if (nextStrat) {
                  const retried = await this.groundingRouter._runStrategy(nextStrat, tabId, step.target || '', 'click');
                  if (retried && retried.elementId) {
                    setSubStage('retry-click-dispatch');
                    const retryBefore    = await this._snapshotElement(tabId, retried.elementId);
                    const retryBeforeUrl = view.webContents.getURL();
                    await this.browserInteractionEngine.clickElement(tabId, retried.elementId);
                    setSubStage('retry-post-condition-verify');
                    const domOk = this._pollElementChanged(tabId, retried.elementId, retryBefore, 3000);
                    const urlOk = isNavClick ? this._pollUrlChanged(tabId, retryBeforeUrl, 4000) : Promise.resolve(false);
                    retryOk = await Promise.race([
                      domOk.then(v => v || false),
                      urlOk.then(v => v || false),
                    ]);
                    if (!retryOk) retryOk = await Promise.race([domOk, urlOk]);
                  } else if (retried && retried.coords) {
                    setSubStage('retry-click-dispatch');
                    await this.browserInteractionEngine.clickAt(tabId, retried.coords.x, retried.coords.y);
                    retryOk = true; // vision coords — no element to snapshot; assume registered
                  }
                }
                if (!retryOk) {
                  this.taskManager.updateStep(task.id, stepEntry.id, 'verified_failed',
                    'Clicked but page state did not change (no DOM/URL/ARIA change detected)');
                  throw new Error('verified_failed: click action produced no observable DOM or URL change');
                }
              }
            }
          } else {
            // Legacy path (no router injected)
            let elementId = null;
            setSubStage('legacy-grounding');
            for (let attempt = 0; attempt < 5; attempt++) {
              const res = await this.browserInteractionEngine.resolveElementLocally(
                tabId, step.target || '', 'browser_click'
              );
              elementId = res.elementId;
              if (elementId) break;
              await new Promise(r => setTimeout(r, 800));
            }
            if (!elementId) throw new Error(`Cannot find element: "${step.target}"`);
            setSubStage('legacy-click-dispatch');
            await this.browserInteractionEngine.clickElement(tabId, elementId);
          }
          break;
        }

        case 'press_key':
          await this.browserInteractionEngine.pressKey(tabId, step.key || 'Enter');
          break;

        case 'scroll': {
          const amt = Number.isFinite(step.amount) ? step.amount : 500;
          await this.browserInteractionEngine.scrollPage(tabId, amt);
          break;
        }

        case 'wait':
          await new Promise(r => setTimeout(r, Math.min(step.ms || 1000, 12000)));
          break;

        case 'visual_interact': {
          // Route through GroundingRouter when available (enforces single-backend rule)
          if (this.groundingRouter) {
            const intent = step.intent || step.text || step.target || 'Perform the requested action';
            const pageCtx = { url: view.webContents.getURL() };
            // visual_interact defaults to 'click'; text presence means it may type after locating the element
            const viActionType = step.text ? 'type' : 'click';
            const grounded = await this.groundingRouter.resolveElement(
              tabId,
              intent,
              pageCtx,
              viActionType,
              { preferVision: step.preferVision !== undefined ? Boolean(step.preferVision) : true }
            );
            if (grounded.elementId) {
              await this.browserInteractionEngine.clickElement(tabId, grounded.elementId);
            } else if (grounded.coords) {
              if (step.text) {
                await this.browserInteractionEngine.typeAt(tabId, grounded.coords.x, grounded.coords.y, step.text);
              } else {
                await this.browserInteractionEngine.clickAt(tabId, grounded.coords.x, grounded.coords.y);
              }
            } else {
              console.warn('[BrowserAgent] visual_interact: GroundingRouter exhausted all strategies for:', intent);
            }
          } else {
            // Legacy path — direct local vision then DOM fallback
            const vs = this.getLocalVisionServer();
            const lm = this.getLocalModelManager();
            if (vs && lm?.getStatus().ready) {
              const screenshot = await this.tabManager.captureScreenshot(tabId);
              if (screenshot) {
                const action = await vs.infer(
                  screenshot,
                  step.intent || step.text || 'Perform the requested action'
                );
                if (action?.action === 'click' && Number.isFinite(action.x)) {
                  await this.browserInteractionEngine.clickAt(tabId, action.x, action.y);
                } else if (action?.action === 'type' && Number.isFinite(action.x)) {
                  await this.browserInteractionEngine.typeAt(tabId, action.x, action.y, step.text || '');
                }
              }
            } else {
              console.warn('[BrowserAgent] visual_interact: UI-TARS not ready, using DOM fallback.');
              if (step.target) {
                const { elementId } = await this.browserInteractionEngine.resolveElementLocally(
                  tabId, step.target, 'browser_click'
                );
                if (elementId) await this.browserInteractionEngine.clickElement(tabId, elementId);
              }
            }
          }
          break;
        }

        case 'extract_and_report': {
          // Extract the visible page text and summarize it back to the user in chat
          this.taskManager.updateStep(task.id, stepEntry.id, 'running', '📖 Reading page content…');
          let rawText = '';
          try {
            rawText = await view.webContents.executeJavaScript(`
              (function() {
                // Wikipedia: prefer article body
                const article = document.querySelector('#mw-content-text .mw-parser-output') ||
                                document.querySelector('article') ||
                                document.querySelector('main') ||
                                document.querySelector('[role="main"]') ||
                                document.body;
                if (!article) return '';
                // Remove nav, footer, ads, scripts, styles
                const cloned = article.cloneNode(true);
                ['script','style','nav','footer','aside','table.infobox',
                 '.mw-editsection','.reflist','#toc','.navbox','.sistersitebox']
                  .forEach(sel => cloned.querySelectorAll(sel).forEach(el => el.remove()));
                // Get text, collapse whitespace, cap at 12000 chars
                return (cloned.innerText || cloned.textContent || '')
                  .replace(/[ \t]+/g, ' ')
                  .replace(/\n{3,}/g, '\n\n')
                  .trim()
                  .slice(0, 12000);
              })()
            `);
          } catch (jsErr) {
            console.error('[BrowserAgent] extract_and_report JS failed:', jsErr.message);
          }

          if (!rawText || rawText.length < 50) {
            this.taskManager.updateStep(task.id, stepEntry.id, 'failed', 'Could not extract page text');
            return null;
          }

          // ── Wrong-page guard: compare <h1>/title against intended topic ────────────
          // Extracts the canonical h1 or page title from the DOM and runs a
          // token-overlap check against the topic parsed from step.intent.
          // If similarity < 0.25, we've likely landed on a disambiguation or
          // unrelated page — discard extracted content and signal re-search.
          if (step.intent) {
            let pageH1 = '';
            try {
              pageH1 = await view.webContents.executeJavaScript(
                '(() => { const h1 = document.querySelector("h1"); return h1 ? (h1.innerText || h1.textContent || "").trim().slice(0, 200) : ""; })()'
              );
            } catch (_) {}
            const pageTitleForCheck = pageH1 || view.webContents.getTitle() || '';
            if (pageTitleForCheck) {
              const relevance = this._checkPageRelevance(pageTitleForCheck, step.intent);
              if (relevance < 0.25) {
                const wrongPageMsg = `⚠️ Landed on wrong/disambiguation page ("${pageTitleForCheck.slice(0, 80)}"). Expected topic: "${step.intent.slice(0, 80)}". Please refine the search and try again.`;
                console.warn(`[BrowserAgent] Wrong-page detected: relevance=${relevance.toFixed(2)}, page title="${pageTitleForCheck}", intent="${step.intent}"`);
                this.taskManager.updateStep(task.id, stepEntry.id, 'failed', wrongPageMsg);
                return wrongPageMsg;
              }
            }
          }

          const currentPageUrl = view.webContents.getURL();
          const summaryStep = this.taskManager.addStep(task.id, '✍️ Summarizing content…', 'running', 'execute');
          let summary = '';
          try {
            const { text } = await this.modelGateway.chat(
              [{ role: 'user', content: `User asked: "${step.intent || 'Summarize this page'}"\n\nPage URL: ${currentPageUrl}\n\nPage content (truncated):\n${rawText}` }],
              {
                systemInstruction:
                  'You are a helpful AI assistant embedded in the Actra browser. ' +
                  'The user navigated to a page and wants you to read and report back. ' +
                  'Provide a clear, well-structured markdown summary of the page content. ' +
                  'Use headings, bullet points, and bold text where appropriate. ' +
                  'Do NOT fabricate any information — only use what is in the provided page content. ' +
                  'End with a brief "Source:" line with the URL.',
                temperature: 0.2,
                maxTokens: 1200,
              }
            );
            summary = text;
            this.taskManager.updateStep(task.id, summaryStep.id, 'completed', 'Summary ready');
          } catch (llmErr) {
            this.taskManager.updateStep(task.id, summaryStep.id, 'failed', llmErr.message);
            // Fallback: return first 800 chars of raw text
            summary = `**Content from ${currentPageUrl}**\n\n${rawText.slice(0, 800)}\n\n_[Could not summarize — showing raw extract]_`;
          }

          this.taskManager.updateStep(task.id, stepEntry.id, 'completed', 'Content extracted');
          return summary;
        }

        default:
          console.warn(`[BrowserAgent] Unknown step type: "${step.type}" — skipping.`);
      }

      // ── Per-step expectedPostState check ─────────────────────────────────
      // Runs only when the planner provides an assertion string.
      // Defaults to null (skip check) for steps that don't set it — backward-compatible.
      const eps = step.expectedPostState || null;
      if (eps && ['type', 'click', 'visual_interact'].includes(step.type)) {
        const postOk = await this._checkExpectedPostState(tabId, eps, view);
        if (!postOk) {
          this.taskManager.updateStep(task.id, stepEntry.id, 'verified_failed',
            `Post-condition not met: "${eps}"`);
          throw new Error(`verified_failed: expected post-state not met: "${eps}"`);
        }
      }

      this.taskManager.updateStep(task.id, stepEntry.id, 'completed', 'Done');
    } catch (err) {
      // 'verified_failed' steps already have their step status set — don't overwrite with 'failed'
      if (!err.message || !err.message.startsWith('verified_failed:')) {
        this.taskManager.updateStep(task.id, stepEntry.id, 'failed', err.message);
      }
      console.error(`[BrowserAgent] Step failed (${step.type}):`, err.message);
      throw err;
    }
  }

  // ── Snapshot / verification helpers ─────────────────────────────────────

  /**
   * Capture a compact state snapshot for an element by its data-actra-id.
   * Returns null if the element is missing or the script throws.
   */
  async _snapshotElement(tabId, elementId) {
    const view = this.tabManager.tabs.get(tabId);
    if (!view) return null;
    try {
      return await view.webContents.executeJavaScript(
        '(() => { const el = document.querySelector(\'[data-actra-id="' + elementId + '"]\');' +
        ' if (!el) return null;' +
        ' const rect = el.getBoundingClientRect();' +
        ' return {' +
        '   value:        el.value != null ? String(el.value) : "",' +
        '   checked:      el.checked != null ? Boolean(el.checked) : null,' +
        '   ariaSelected: el.getAttribute("aria-selected"),' +
        '   ariaChecked:  el.getAttribute("aria-checked"),' +
        '   ariaExpanded: el.getAttribute("aria-expanded"),' +
        '   classList:    el.className || "",' +
        '   visible:      rect.width > 0 && rect.height > 0,' +
        '   outerHTML:    (el.outerHTML || "").slice(0, 300),' +
        ' }; })()'
      );
    } catch (_) {
      return null;
    }
  }

  /**
   * Poll every 300 ms for up to timeoutMs for the element's state to differ
   * from `before`. Returns true when a change is detected or the element
   * disappears; false if the timeout elapses with no change.
   */
  async _pollElementChanged(tabId, elementId, before, timeoutMs) {
    if (!before) return true; // no baseline — treat as changed
    const view = this.tabManager.tabs.get(tabId);
    if (!view) return true;
    const start = Date.now();
    const beforeSerial = JSON.stringify(before);
    while (Date.now() - start < timeoutMs) {
      try {
        const after = await view.webContents.executeJavaScript(
          '(() => { const el = document.querySelector(\'[data-actra-id="' + elementId + '"]\');' +
          ' if (!el) return null;' +
          ' const rect = el.getBoundingClientRect();' +
          ' return {' +
          '   value:        el.value != null ? String(el.value) : "",' +
          '   checked:      el.checked != null ? Boolean(el.checked) : null,' +
          '   ariaSelected: el.getAttribute("aria-selected"),' +
          '   ariaChecked:  el.getAttribute("aria-checked"),' +
          '   ariaExpanded: el.getAttribute("aria-expanded"),' +
          '   classList:    el.className || "",' +
          '   visible:      rect.width > 0 && rect.height > 0,' +
          '   outerHTML:    (el.outerHTML || "").slice(0, 300),' +
          ' }; })()'
        );
        if (after === null) return true; // element gone → navigated or removed
        if (JSON.stringify(after) !== beforeSerial) return true;
      } catch (_) {
        return true; // script error → page navigated
      }
      await new Promise(r => setTimeout(r, 300));
    }
    return false;
  }

  /**
   * Evaluate an expectedPostState string against the current tab state.
   *
   * Supported patterns (case-insensitive):
   *   "url contains X"         → checks window.location.href
   *   "url equals X"           → strict URL match
   *   "input value equals X"   → any visible input whose value includes X
   *   "aria-checked equals X"  → any element with that aria attribute value
   *   "checkbox becomes checked"→ any checked checkbox
   *   (fallback)               → visible body text includes the phrase
   *
   * Returns true if the assertion passes, true if eps is falsy (skip check).
   */
  async _checkExpectedPostState(tabId, eps, view) {
    if (!eps) return true;
    const leps = eps.toLowerCase().trim();
    try {
      if (leps.startsWith('url contains ')) {
        const phrase = eps.slice('url contains '.length).trim().toLowerCase();
        return view.webContents.getURL().toLowerCase().includes(phrase);
      }
      if (leps.startsWith('url equals ')) {
        const target = eps.slice('url equals '.length).trim().toLowerCase();
        return view.webContents.getURL().toLowerCase() === target;
      }
      // Delegate DOM assertions to page-side JS
      const result = await view.webContents.executeJavaScript(
        '(function() {' +
        ' var eps = ' + JSON.stringify(leps) + ';' +
        ' var valMatch = eps.match(/^input\\s+value\\s+equals?\\s+(.+)$/);' +
        ' if (valMatch) {' +
        '   var expected = valMatch[1].trim();' +
        '   var inputs = Array.from(document.querySelectorAll("input,textarea"));' +
        '   return inputs.some(function(el) { return (el.value||"").toLowerCase().includes(expected); });' +
        ' }' +
        ' var ariaMatch = eps.match(/^(aria-[\\w-]+)\\s+equals?\\s+(.+)$/);' +
        ' if (ariaMatch) {' +
        '   var attr = ariaMatch[1]; var val = ariaMatch[2].trim();' +
        '   var all = Array.from(document.querySelectorAll("[" + attr + "]"));' +
        '   return all.some(function(el) { return (el.getAttribute(attr)||"").toLowerCase() === val; });' +
        ' }' +
        ' if (eps.includes("checkbox") && eps.includes("checked")) {' +
        '   return Array.from(document.querySelectorAll("input[type=checkbox]")).some(function(el) { return el.checked; });' +
        ' }' +
        ' var body = document.body && document.body.innerText ? document.body.innerText.toLowerCase() : "";' +
        ' return body.includes(eps);' +
        '})()'
      );
      return Boolean(result);
    } catch (_) {
      return true; // give benefit of the doubt on script errors (page mid-navigation)
    }
  }

  /** Extract hostname from a URL string safely. */
  _domainOf(url) {
    try { return new URL(url).hostname || 'unknown'; }
    catch (_) { return 'unknown'; }
  }

  /**
   * Token-overlap semantic similarity check between a page title and an intended topic.
   * Zero LLM, zero network — pure string matching.
   *
   * Algorithm: Jaccard similarity over meaningful word tokens.
   *   - Strips punctuation, lowercases, removes stop words (a, an, the, of, in, on …)
   *   - Returns a [0, 1] score. Threshold 0.25 = "plausibly related".
   *
   * @param {string} pageTitle   The page's <h1> or document.title
   * @param {string} intentText  The user's intended topic / step.intent
   * @returns {number} similarity in [0, 1]
   */
  _checkPageRelevance(pageTitle, intentText) {
    const STOP_WORDS = new Set([
      'a','an','the','of','in','on','at','for','to','and','or','is','are','was',
      'were','it','its','this','that','with','from','by','as','be','been',
    ]);
    const tokenize = (str) => String(str || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));

    const titleTokens = new Set(tokenize(pageTitle));
    const intentTokens = new Set(tokenize(intentText));

    if (titleTokens.size === 0 || intentTokens.size === 0) return 1; // can't determine, don't block

    let intersection = 0;
    for (const tok of intentTokens) {
      if (titleTokens.has(tok)) intersection++;
    }
    // Jaccard: intersection / union
    const union = titleTokens.size + intentTokens.size - intersection;
    return union === 0 ? 1 : intersection / union;
  }

  async finish(taskId, assistantMsgId, auditEntryId, answer) {
    this.taskManager.updateTaskStatus(taskId, 'completed', { outputs: answer || 'Task completed.' });
    if (assistantMsgId) {
      await this.chatManager.updateMessage(assistantMsgId, { content: '✅ ' + (answer || 'Task completed successfully.') });
    }
    this.auditLog.updateEntry(auditEntryId, { execution_status: 'success', execution_result: answer });
  }

  /**
   * Resolves vague pronouns (them/it/this/these/that) to the actual topic
   * from recent chat history. Zero LLM call if no pronoun is detected.
   *
   * e.g. "search them in wikipedia" → "search tigers in wikipedia"
   *      after user was discussing tigers.
   *
   * @param {string} command
   * @returns {Promise<string>} Resolved command
   */
  async _resolvePronouns(command) {
    // Only trigger if command has a vague pronoun
    const pronounPattern = /\b(them|it|this|these|that|those|the topic|the subject)\b/i;
    if (!pronounPattern.test(command)) return command;

    // Skip resolution for pure navigation commands like "open this page", "visit this"
    const isNavOnly = /^\s*(?:open|go to|navigate|visit|launch|load)\s/i.test(command);
    if (isNavOnly) return command;

    try {
      const history = await this.chatManager.getHistory();
      if (!history?.length) return command;

      // Get last 6 messages (3 turns), skip the current assistant turn if present
      const recent = history
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-7, -1)
        .map(m => `${m.role === 'user' ? 'User' : 'Actra'}: ${(typeof m.content === 'string' ? m.content : '').slice(0, 300)}`)
        .join('\n');

      if (!recent.trim()) return command;

      const { text } = await this.modelGateway.chat(
        [{ role: 'user', content: `Recent conversation:\n${recent}\n\nCurrent command: "${command}"\n\nRewrite the command replacing any vague pronouns (them, it, this, these, that) with the specific topic from the conversation. Return ONLY the rewritten command string, nothing else.` }],
        { role: 'chat', temperature: 0, maxTokens: 80 }
      );

      const resolved = (text || '').trim().replace(/^["']|["']$/g, '').trim();
      if (resolved && resolved.length > 3 && resolved !== command) {
        console.log(`[BrowserAgent] Pronoun resolved: "${command}" → "${resolved}"`);
        return resolved;
      }
    } catch (err) {
      console.warn('[BrowserAgent] Pronoun resolution failed:', err.message);
    }

    return command;
  }

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * MCQ FAST-PATH
   * ─────────────────────────────────────────────────────────────────────────
   * Dedicated pipeline for pages detected as MCQ/quiz pages by detectMCQPage().
   *
   * Pipeline:
   *   1. Single DOM batch-extract of all questions + options (getMCQContext)
   *   2. Coding-question detection → real code execution when possible
   *   3. Single LLM call via planner.answerMCQBatch() (temp ≈ 0)
   *   4. Low-confidence (< 0.6) questions → routed through ApprovalEngine
   *   5. Per-option grounded click via grounding-router + post-condition verify
   *   6. Retry via getNextStrategy on verify failure (reuses Section 2 logic)
   *
   * Only falls back to _solveMcqLoop() if batch extraction yields no questions.
   */
  async _solveMcqFastPath(tabId, task, assistantMsg, auditEntryId, originalCommand, mcqModel) {
    return this._solveSequentialQuiz(tabId, task, assistantMsg, auditEntryId, originalCommand, { isSequential: true }, mcqModel);
  }

  /**
   * \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   * SEQUENTIAL QUIZ SOLVER
   * \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   * For pages where detectSequentialQuizMode() returns true.
   * Each iteration handles exactly ONE question: read \u2192 reason \u2192 select \u2192
   * verify selection \u2192 submit \u2192 verify advance \u2192 next.
   *
   * Separation guarantee: touches NONE of the fast-path or vision-loop code
   * paths. All helpers are local to this method.
   *
   * @param {string} tabId
   * @param {object} task
   * @param {object} assistantMsg
   * @param {string} auditEntryId
   * @param {string} originalCommand
   * @param {{ isSequential: boolean, timerText: string, optionCount: number }} seqInfo
   */
  async _solveSequentialQuiz(tabId, task, assistantMsg, auditEntryId, originalCommand, seqInfo = {}, mcqModel) {
    const MAX_QUESTIONS = 100;
    const pageCtxEngine = this.pageContextEngine || (PageContextEngine ? new PageContextEngine(this.tabManager) : null);
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const safeText = (v, n = 160) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);

    // Helpers to identify action buttons
    const isSaveNextBtn = (txt) => /\b(save\s*(&|and)?\s*next|submit\s*(&|and)?\s*next)\b/i.test(txt);
    const isNextBtn = (txt) => (/\b(next(\s*question)?|continue|proceed|forward)\b/i.test(txt) || /^(>|→|»)$/.test(txt.trim())) && !/^(end|finish|quit|exit)/i.test(txt.trim());
    const isSubmitBtn = (txt) => (/\b(submit(\s*answer)?|check(\s*answer)?|confirm|save|mark|verify)\b/i.test(txt) && !/\b(test|quiz|exam|practice)\b/i.test(txt));
    const isFinalSubmitBtn = (txt) => /\b(submit\s*(test|exam|quiz)|finish\s*(test|quiz|exam)|end\s*(test|quiz|practice)|complete\s*test)\b/i.test(txt.trim());

    // Check if the page displays completion indicators
    const isQuizFinished = (text) => /\b(quiz completed|test completed|exam completed|assessment completed|submitted successfully|test submitted|quiz submitted|all questions (have been )?answered|you have completed the (test|quiz|exam)|thank you for taking|view results|review answers|test summary|assessment finished)\b/i.test(text)
      || (/\bcongratulations\b/i.test(text) && /\b(score|completed|finished|points|result)\b/i.test(text))
      || (/\byour score\b/i.test(text) && /\b(\d+\s*\/\s*\d+|\d+%)\b/i.test(text));

    // Focus tab
    try {
      this.tabManager.setActiveTab(tabId);
      const v = this.tabManager.tabs.get(tabId);
      if (v) {
        try { this.tabManager.updateViewBounds(v); } catch {}
        try { v.webContents.focus(); } catch {}
      }
    } catch {}

    const startStep = this.taskManager.addStep(task.id, '🚀 MCQ Solver: Starting continuous solve loop…', 'running', 'plan');

    let solved = 0;
    let skipped = 0;
    const answers = [];
    const questionTimesMs = [];
    let consecutiveNoQuestionCycles = 0;
    let lastQuestionFingerprint = '';
    let consecutiveDuplicateCycles = 0;
    let quizFinished = false;

    // Helper to get fingerprint of current question
    const getFingerprint = (ctx) => {
      if (!ctx) return '';
      const textSample = safeText(ctx.bodyText || '', 200);
      const optSample = (ctx.options || []).map(o => safeText(o.text, 40)).join('|');
      return `${textSample}###${optSample}`;
    };

    // Helper to read question counter (e.g. "Question 3 of 10", "3 / 10")
    const readQuestionCounter = async () => {
      const view = this.tabManager.tabs.get(tabId);
      if (!view) return null;
      try {
        return await view.webContents.executeJavaScript(`(() => {
          const text = (document.body && document.body.innerText) ? document.body.innerText : '';
          const m = text.match(/\\bquestion\\s*(\\d+)\\s*(?:of|\\/)\\s*(\\d+)\\b/i) || text.match(/\\b(\\d+)\\s*\\/\\s*(\\d+)\\b/);
          return m ? { current: parseInt(m[1], 10), total: parseInt(m[2], 10) } : null;
        })()`);
      } catch { return null; }
    };

    this.taskManager.updateStep(task.id, startStep.id, 'completed', 'Solver initialized. Processing questions…');

    // Log which MCQ model will be used for every answer call in this run
    if (mcqModel) {
      console.log(`[MCQ] Subject model override: ${mcqModel}`);
    }

    // ─── CONTINUOUS SOLVING LOOP ──────────────────────────────────────────
    for (let iteration = 0; iteration < MAX_QUESTIONS; iteration++) {
      if (this.taskManager.getTask(task.id)?.status === 'cancelled') {
        console.log('[MCQ] Task cancelled by user.');
        break;
      }

      const qStartMs = Date.now();

      // Step 1: Capture screenshot for live preview in chat
      let screenshot = null;
      try {
        screenshot = await this.tabManager.captureScreenshot(tabId);
      } catch (err) {
        console.warn('[MCQ] Screenshot capture warning:', err.message);
      }

      const qStep = this.taskManager.addStep(
        task.id,
        `📸 Question ${solved + 1}: Reading question and options…`,
        'running',
        'execute'
      );
      if (screenshot) {
        qStep.screenshot = screenshot;
        this.taskManager.updateStep(task.id, qStep.id, 'running');
      }

      // Step 2: Fetch MCQ context with fast retries for page transition
      let context = null;
      for (let retry = 0; retry < 5; retry++) {
        try {
          context = await pageCtxEngine.getMCQContext(tabId);
        } catch {}

        // Check if page transitioned to completed state
        if (isQuizFinished(context?.bodyText || '')) {
          quizFinished = true;
          break;
        }

        // If we found options or questions, stop waiting
        if (context && (context.options?.length > 0 || (context.bodyText && context.bodyText.length > 30))) {
          const fp = getFingerprint(context);
          if (solved === 0 || fp !== lastQuestionFingerprint || retry >= 3) {
            break;
          }
        }

        await wait(250);
      }

      if (quizFinished) {
        this.taskManager.updateStep(task.id, qStep.id, 'completed', 'Quiz completion screen reached.');
        break;
      }

      let options = context?.options || [];
      let buttons = context?.buttons || [];
      let bodyText = context?.bodyText || '';

      // Check if page is finished
      if (isQuizFinished(bodyText)) {
        this.taskManager.updateStep(task.id, qStep.id, 'completed', 'Quiz completion screen reached.');
        break;
      }

      // If no options found in DOM
      if (options.length === 0) {
        // Check counter: did we finish total questions?
        const counter = await readQuestionCounter();
        if (counter && counter.total > 0 && counter.current >= counter.total && solved > 0) {
          console.log(`[MCQ] All ${counter.total} questions answered per counter.`);
          const finalBtn = buttons.find(b => isFinalSubmitBtn(b.text));
          if (finalBtn) {
            try { await pageCtxEngine.submitMCQAnswer(tabId, finalBtn.id); } catch {}
            await wait(1000);
          }
          this.taskManager.updateStep(task.id, qStep.id, 'completed', `Completed all ${counter.total} questions.`);
          break;
        }

        // Check if only a final submit/end test button exists and we solved at least 1 question
        const finalBtn = buttons.find(b => isFinalSubmitBtn(b.text));
        if (finalBtn && solved > 0 && !buttons.some(b => isNextBtn(b.text))) {
          console.log('[MCQ] Final submit button reached with no options left. Submitting test.');
          try {
            await pageCtxEngine.submitMCQAnswer(tabId, finalBtn.id);
            await wait(1000);
          } catch {}
          this.taskManager.updateStep(task.id, qStep.id, 'completed', 'Test submitted.');
          break;
        }

        // Vision fallback if DOM has no options: Split 2-call architecture
        if (screenshot && this.modelGateway?.visionChat) {
          this.taskManager.updateStep(task.id, qStep.id, 'running', 'No DOM options found — reading screen via vision…');
          try {
            // CALL 1: Multimodal Vision Extraction — ALWAYS uses vision model (MODELS.vision), never text-only mcqModel
            const vPrompt = `Examine this quiz screen carefully.
Is the quiz or test finished/completed? If yes, respond with:
{"done": true}

If there is an active question on screen, extract the question and all visible options along with their clickable pixel coordinates (the center point of each option's radio button, checkbox, or option container):
{
  "done": false,
  "question": "exact question text",
  "options": [
    { "letter": "A", "text": "option text", "coordinates": {"x": 120, "y": 340} },
    { "letter": "B", "text": "option text", "coordinates": {"x": 120, "y": 380} }
  ]
}
Return ONLY valid JSON.`;
            const vRes = await this.modelGateway.visionChat(screenshot, vPrompt, { maxTokens: 600, temperature: 0.1 });
            let parsedVision = null;
            try {
              const cleaned = (vRes?.text || '').replace(/```json/i, '').replace(/```/g, '').trim();
              parsedVision = JSON.parse(cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1));
            } catch {}

            if (parsedVision?.done) {
              this.taskManager.updateStep(task.id, qStep.id, 'completed', 'Completed (confirmed by vision).');
              break;
            }

            const visionQuestion = safeText(parsedVision?.question || '', 2000);
            const visionOptions = Array.isArray(parsedVision?.options) ? parsedVision.options : [];

            if (visionQuestion && visionOptions.length > 0) {
              // CALL 2: Dedicated Reasoning Call using mcqModel override (pure text LLM)
              const modelLabel = mcqModel ? mcqModel.split('/').pop() : 'model';
              this.taskManager.updateStep(task.id, qStep.id, 'running', `Reasoning answer with ${modelLabel}…`);

              const optListText = visionOptions.map((o, idx) =>
                `${o.letter || String.fromCharCode(65 + idx)}. ${safeText(o.text || '', 200)}`
              ).join('\n');

              const reasoningPrompt = `You are an expert quiz solver. Answer this question accurately and immediately.

QUESTION:
${visionQuestion}

OPTIONS:
${optListText}

Choose the single best correct option.
Return JSON:
{
  "answer_index": 0,
  "confidence": 0.95,
  "reasoning": "brief 1-sentence reason"
}`;

              const answerSchema = {
                type: 'object',
                properties: {
                  answer_index: { type: 'number', description: '0-based index of correct option' },
                  confidence: { type: 'number', description: 'Confidence 0 to 1' },
                  reasoning: { type: 'string', description: 'Brief reason' },
                },
                required: ['answer_index', 'confidence'],
              };

              let answer = null;
              try {
                const { data } = await this.modelGateway.structuredOutput(reasoningPrompt, answerSchema, {
                  temperature: 0.05,
                  role: 'planner',
                  ...(mcqModel ? { model: mcqModel } : {}),
                });
                answer = data;
              } catch (reasonErr) {
                try {
                  const chatRes = await this.modelGateway.chat(
                    [{ role: 'user', content: reasoningPrompt + '\nReturn ONLY raw JSON.' }],
                    {
                      temperature: 0.05,
                      maxTokens: 120,
                      role: 'planner',
                      ...(mcqModel ? { model: mcqModel } : {}),
                    }
                  );
                  const raw = chatRes?.text || '';
                  const cleaned = raw.replace(/```json/i, '').replace(/```/g, '').trim();
                  const jsonStr = cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1);
                  answer = JSON.parse(jsonStr);
                } catch (chatErr) {
                  console.warn('[MCQ] Vision path reasoning fallback failed:', chatErr.message);
                  answer = { answer_index: 0, confidence: 0.5 };
                }
              }

              const answerIndex = Math.max(0, Math.min(Number(answer?.answer_index ?? 0), visionOptions.length - 1));
              const chosenOpt = visionOptions[answerIndex];
              const coords = chosenOpt?.coordinates || chosenOpt?.click_coordinates || (chosenOpt?.x !== undefined ? { x: chosenOpt.x, y: chosenOpt.y } : null);

              if (coords?.x && coords?.y) {
                await this.browserInteractionEngine.clickAt(tabId, coords.x, coords.y);
                await wait(300);
                await this._advanceQuizQuestion(tabId, context);
                solved++;
                answers.push({
                  question: safeText(visionQuestion, 80),
                  answer: safeText(chosenOpt.text || chosenOpt.letter, 60),
                  confidence: Number(answer?.confidence ?? 0.8),
                });
                questionTimesMs.push(Date.now() - qStartMs);
                this.taskManager.updateStep(task.id, qStep.id, 'completed', `✅ Q${solved}: Answered via vision coords (${modelLabel})`);
                await wait(500);
                continue;
              }
            } else if (parsedVision?.click_coordinates?.x && parsedVision?.click_coordinates?.y) {
              // Direct coordinates fallback if returned without structured options array
              await this.browserInteractionEngine.clickAt(tabId, parsedVision.click_coordinates.x, parsedVision.click_coordinates.y);
              await wait(300);
              await this._advanceQuizQuestion(tabId, context);
              solved++;
              this.taskManager.updateStep(task.id, qStep.id, 'completed', `✅ Q${solved}: Answered via vision coords`);
              await wait(500);
              continue;
            }
          } catch (vErr) {
            console.warn('[MCQ] Vision fallback error:', vErr.message);
          }
        }

        consecutiveNoQuestionCycles++;
        if (consecutiveNoQuestionCycles >= 3) {
          console.log('[MCQ] No options or questions detected after 3 consecutive attempts. Stopping loop.');
          this.taskManager.updateStep(task.id, qStep.id, 'completed', 'No more questions found.');
          break;
        }
        this.taskManager.updateStep(task.id, qStep.id, 'running', 'Waiting for question to load…');
        await wait(800);
        continue;
      }

      consecutiveNoQuestionCycles = 0;

      // Duplicate question detection: make sure we don't answer the same question twice
      const currentFingerprint = getFingerprint(context);
      if (lastQuestionFingerprint && currentFingerprint === lastQuestionFingerprint) {
        consecutiveDuplicateCycles++;
        if (consecutiveDuplicateCycles >= 3) {
          console.warn('[MCQ] Page unchanged after 3 cycles. Forcing advance click.');
          await this._advanceQuizQuestion(tabId, context);
          await wait(800);
          consecutiveDuplicateCycles = 0;
          continue;
        }
        await this._advanceQuizQuestion(tabId, context);
        await wait(400);
        continue;
      }
      consecutiveDuplicateCycles = 0;
      lastQuestionFingerprint = currentFingerprint;

      // Extract question text
      let questionText = safeText(bodyText
        ?.replace(/Questions Attempted:\s*\d+\/\d+/i, '')
        ?.replace(/If you skip[\s\S]*$/i, ''), 2000);

      // Fast formatting of options
      const optionListText = options.map((o, idx) =>
        `${String.fromCharCode(65 + idx)}. ${safeText(o.text, 200)}`
      ).join('\n');

      // Fast structured LLM reasoning (300-500ms)
      const reasoningPrompt = `You are an expert quiz solver. Answer this question accurately and immediately.

QUESTION:
${questionText}

OPTIONS:
${optionListText}

Choose the single best correct option.
Return JSON:
{
  "answer_index": 0,
  "confidence": 0.95,
  "reasoning": "brief 1-sentence reason"
}`;

      const answerSchema = {
        type: 'object',
        properties: {
          answer_index: { type: 'number', description: '0-based index of correct option' },
          confidence: { type: 'number', description: 'Confidence 0 to 1' },
          reasoning: { type: 'string', description: 'Brief reason' },
        },
        required: ['answer_index', 'confidence'],
      };

      let answer = null;
      try {
        const { data } = await this.modelGateway.structuredOutput(reasoningPrompt, answerSchema, {
          temperature: 0.05,
          role: 'planner',
          ...(mcqModel ? { model: mcqModel } : {}),
        });
        answer = data;
      } catch (err) {
        // Fast JSON chat fallback
        try {
          const chatRes = await this.modelGateway.chat(
            [{ role: 'user', content: reasoningPrompt + '\nReturn ONLY raw JSON.' }],
            { temperature: 0.05, maxTokens: 120, ...(mcqModel ? { model: mcqModel } : {}) }
          );
          const raw = chatRes?.text || '';
          const cleaned = raw.replace(/\`\`\`json/i, '').replace(/\`\`\`/g, '').trim();
          const jsonStr = cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1);
          answer = JSON.parse(jsonStr);
        } catch (chatErr) {
          console.warn('[MCQ] Fast reasoning failed:', chatErr.message);
          answer = { answer_index: 0, confidence: 0.5, reasoning: 'Fallback choice' };
        }
      }

      const answerIndex = Math.max(0, Math.min(Number(answer?.answer_index ?? 0), options.length - 1));
      const confidence = Number(answer?.confidence ?? 0.8);
      const chosenOpt = options[answerIndex];

      if (!chosenOpt) {
        skipped++;
        this.taskManager.updateStep(task.id, qStep.id, 'failed', 'Option index out of range');
        await this._advanceQuizQuestion(tabId, context);
        continue;
      }

      // Step 3: Select the chosen option
      let selectedOk = false;
      try {
        const selRes = await pageCtxEngine.selectMCQOption(tabId, chosenOpt.id);
        if (selRes?.success) selectedOk = true;
      } catch {}

      // Fallback in-page click to guarantee selection
      const view = this.tabManager.tabs.get(tabId);
      if (view) {
        try {
          await view.webContents.executeJavaScript(`(() => {
            const id = "${String(chosenOpt.id).replace(/"/g, '\\"')}";
            const el = document.querySelector('[data-actra-mcq-id="' + id + '"]') || document.getElementById(id);
            if (el) {
              el.click();
              const inp = el.tagName === 'INPUT' ? el : el.querySelector('input[type="radio"], input[type="checkbox"]');
              if (inp) {
                inp.checked = true;
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
          })()`);
          selectedOk = true;
        } catch {}
      }

      solved++;
      const displayAns = safeText(chosenOpt.text, 60);
      answers.push({ question: safeText(questionText, 80), answer: displayAns, confidence });
      questionTimesMs.push(Date.now() - qStartMs);

      this.taskManager.updateStep(
        task.id,
        qStep.id,
        'completed',
        `✅ Q${solved}: ${safeText(questionText, 50)} → Option ${String.fromCharCode(65 + answerIndex)}: "${displayAns}" (${(confidence * 100).toFixed(0)}%)`
      );

      // Step 4: Advance to next question
      await wait(200);
      await this._advanceQuizQuestion(tabId, context);

      // Step 5: Responsive polling for next question to load
      for (let p = 0; p < 15; p++) {
        await wait(150);
        const checkCtx = await pageCtxEngine.getMCQContext(tabId).catch(() => null);
        if (isQuizFinished(checkCtx?.bodyText || '')) {
          quizFinished = true;
          break;
        }
        const checkFp = getFingerprint(checkCtx);
        if (checkFp && checkFp !== currentFingerprint) {
          // Next question rendered! Proceed immediately
          break;
        }
      }

      if (quizFinished) break;
    } // end for loop

    // ─── FINAL TEST SUBMISSION & COMPLETION VERIFICATION ─────────────────
    try {
      const finalCtx = await pageCtxEngine.getMCQContext(tabId).catch(() => null);
      const endBtn = (finalCtx?.buttons || []).find(b => isFinalSubmitBtn(b.text));
      if (endBtn && solved > 0) {
        console.log('[MCQ] Final quiz submit button found. Submitting test to finalize.');
        await pageCtxEngine.submitMCQAnswer(tabId, endBtn.id);
        await wait(1000);

        // Check for modal confirmation e.g. "Yes, submit"
        const view = this.tabManager.tabs.get(tabId);
        if (view) {
          await view.webContents.executeJavaScript(`(() => {
            const btns = Array.from(document.querySelectorAll('button, a, input[type="button"]'));
            const confirmBtn = btns.find(b => /^(yes|confirm|submit|yes, submit|ok|proceed)$/i.test((b.innerText || b.value || '').trim()));
            if (confirmBtn) confirmBtn.click();
          })()`).catch(() => {});
        }
        await wait(800);
      }
    } catch {}

    // Compute average time
    const avgMs = questionTimesMs.length
      ? Math.round(questionTimesMs.reduce((a, b) => a + b, 0) / questionTimesMs.length)
      : 0;

    const summaryLines = answers.map((a, i) =>
      `${i + 1}. ${safeText(a.question, 70)} → **${safeText(a.answer, 50)}**`
    );

    const finalSummary = [
      `🎉 **All MCQs solved successfully!**`,
      `• Total questions answered: **${solved}**`,
      skipped > 0 ? `• Skipped: **${skipped}**` : '',
      `• Average speed: **${(avgMs / 1000).toFixed(1)}s** per question`,
      summaryLines.length ? `\n\n**Answers:**\n${summaryLines.join('\n')}` : '',
    ].filter(Boolean).join('\n');

    this.taskManager.updateTaskStatus(task.id, 'completed', { outputs: finalSummary });
    if (assistantMsg?.id) await this.chatManager.updateMessage(assistantMsg.id, { content: finalSummary });
    this.auditLog?.updateEntry(auditEntryId, {
      execution_status: 'success',
      execution_result: finalSummary,
      solved_count: solved,
    });
  }

  /**
   * Helper to advance a quiz question (Save & Next, Submit + Next, or standalone Next).
   * @param {string} tabId
   * @param {object} context
   * @returns {Promise<boolean>}
   */
  async _advanceQuizQuestion(tabId, context) {
    const pageCtxEngine = this.pageContextEngine;
    const isSaveNextBtn = (txt) => /\b(save\s*(&|and)?\s*next|submit\s*(&|and)?\s*next)\b/i.test(txt);
    const isNextBtn = (txt) => (/\b(next(\s*question)?|continue|proceed|forward)\b/i.test(txt) || /^(>|→|»)$/.test(txt.trim())) && !/^(end|finish|quit|exit)/i.test(txt.trim());
    const isSubmitBtn = (txt) => (/\b(submit(\s*answer)?|check(\s*answer)?|confirm|save|mark|verify)\b/i.test(txt) && !/\b(test|quiz|exam|practice)\b/i.test(txt));
    const isDangerBtn = (txt) => /^(end\s*(practice|test|quiz|exam)|finish\s*(test|quiz|exam)|submit\s*(test|exam)|exit|quit)$/i.test(txt.trim());

    // Re-read buttons from page in case DOM changed after selection
    let freshCtx = null;
    try {
      freshCtx = await pageCtxEngine.getMCQContext(tabId);
    } catch {}
    const buttons = freshCtx?.buttons?.length ? freshCtx.buttons : (context?.buttons || []);

    // 1. Combined Save & Next (best)
    const saveNextBtn = buttons.find(b => !isDangerBtn(b.text) && isSaveNextBtn(b.text));
    if (saveNextBtn) {
      try {
        await pageCtxEngine.submitMCQAnswer(tabId, saveNextBtn.id);
        return true;
      } catch {}
    }

    // 2. Submit / Check
    const submitBtn = buttons.find(b => !isDangerBtn(b.text) && isSubmitBtn(b.text));
    if (submitBtn) {
      try {
        await pageCtxEngine.submitMCQAnswer(tabId, submitBtn.id);
      } catch {}

      // Wait 250ms to see if Next appeared after submit
      await new Promise(r => setTimeout(r, 250));
      const postSubmitCtx = await pageCtxEngine.getMCQContext(tabId).catch(() => null);
      const nextBtnAfterSubmit = (postSubmitCtx?.buttons || []).find(b => !isDangerBtn(b.text) && isNextBtn(b.text));
      if (nextBtnAfterSubmit) {
        try {
          await pageCtxEngine.submitMCQAnswer(tabId, nextBtnAfterSubmit.id);
          return true;
        } catch {}
      }
      return true;
    }

    // 3. Standalone Next
    const nextBtn = buttons.find(b => !isDangerBtn(b.text) && isNextBtn(b.text));
    if (nextBtn) {
      try {
        await pageCtxEngine.submitMCQAnswer(tabId, nextBtn.id);
        return true;
      } catch {}
    }

    // 4. Final submit button if no other action buttons exist (e.g. "Submit Test", "Finish Test" on the last question)
    const isFinalSubmitBtn = (txt) => /\b(submit\s*(test|exam|quiz)|finish\s*(test|quiz|exam)|end\s*(test|quiz|practice)|complete\s*test)\b/i.test(txt.trim());
    const finalSubmitBtn = buttons.find(b => isFinalSubmitBtn(b.text));
    if (finalSubmitBtn) {
      try {
        await pageCtxEngine.submitMCQAnswer(tabId, finalSubmitBtn.id);
        return true;
      } catch {}
    }

    // 4. In-page JavaScript fallback: click any visible element with Next / Continue / Save
    const view = this.tabManager.tabs.get(tabId);
    if (view) {
      try {
        return await view.webContents.executeJavaScript(`(() => {
          const isVisible = (el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && window.getComputedStyle(el).display !== 'none';
          };
          const all = Array.from(document.querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"]'));
          for (const el of all) {
            if (!isVisible(el)) continue;
            const t = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim();
            if (/^(end|finish|exit|quit|submit test|submit exam)/i.test(t)) continue;
            if (/(save.*next|next|continue|proceed|submit answer)/i.test(t) || t === '>' || t === '→' || t === '»') {
              el.click();
              return true;
            }
          }
          return false;
        })()`);
      } catch {}
    }
    return false;
  }

  /**
   * Evaluate a tab to check if it contains an active MCQ quiz or test.
   * Scores the tab based on sequential quiz detection, MCQ detection, URL/title cues, and option count.
   * @param {string} tabId
   * @returns {Promise<{ hasMCQs: boolean, isSequential: boolean, isMCQPage: boolean, optionCount: number, timerText: string, score: number, title: string, url: string }>}
   */
  async _evaluateTabForMCQs(tabId) {
    const view = this.tabManager.tabs.get(tabId);
    if (!view) return { hasMCQs: false, isSequential: false, isMCQPage: false, optionCount: 0, timerText: '', score: 0, title: '', url: '' };

    let url = '';
    let title = '';
    try {
      url = view.webContents?.getURL() || '';
      title = view.webContents?.getTitle() || '';
    } catch (_) {}

    // Discard empty or internal pages
    if (!url || url.includes('chrome://') || url.includes('about:blank')) {
      return { hasMCQs: false, isSequential: false, isMCQPage: false, optionCount: 0, timerText: '', score: 0, title, url };
    }

    let score = 0;
    // URL or title signals
    if (/\b(quiz|test|exam|assessment|practice|mcq|questionnaire|evaluation|form|contest|challenge)\b/i.test(url + ' ' + title)) {
      score += 6;
    }

    // Check sequential quiz mode first
    let seqDetect = { isSequential: false, timerText: '', optionCount: 0, hasSingleBlock: false, hasActionButton: false };
    if (this.pageContextEngine?.detectSequentialQuizMode) {
      try {
        seqDetect = await this.pageContextEngine.detectSequentialQuizMode(tabId);
      } catch (_) {}
    }

    if (seqDetect.isSequential) {
      score += 15;
    } else if (seqDetect.optionCount >= 2) {
      score += 8;
    }

    // Check general MCQ page
    let isMCQ = false;
    if (this.pageContextEngine?.detectMCQPage) {
      try {
        isMCQ = await this.pageContextEngine.detectMCQPage(tabId);
      } catch (_) {}
    }
    if (isMCQ) {
      score += 10;
    }

    // Fallback: check getMCQContext if neither fired
    let optionCount = seqDetect.optionCount || 0;
    if (!seqDetect.isSequential && !isMCQ && this.pageContextEngine?.getMCQContext) {
      try {
        const ctx = await this.pageContextEngine.getMCQContext(tabId);
        if (ctx?.options?.length >= 2) {
          optionCount = ctx.options.length;
          score += 8;
          isMCQ = true;
        }
      } catch (_) {}
    }

    const hasMCQs = score >= 6 || seqDetect.isSequential || isMCQ;
    return {
      hasMCQs,
      isSequential: Boolean(seqDetect.isSequential),
      isMCQPage: Boolean(isMCQ),
      optionCount,
      timerText: seqDetect.timerText || '',
      score,
      title,
      url,
    };
  }

  /**
   * Find the open tab that contains the MCQ quiz.
   * Prefers the active tab if it already contains MCQs; otherwise scans all open tabs.
   * @param {string} preferredTabId
   * @returns {Promise<{ tabId: string, hasMCQs: boolean, isSequential: boolean, isMCQPage: boolean, optionCount: number, timerText: string, title: string, url: string }>}
   */
  async _findMcqTab(preferredTabId) {
    // 1. Check preferred tab first
    if (preferredTabId && this.tabManager.tabs.has(preferredTabId)) {
      const status = await this._evaluateTabForMCQs(preferredTabId);
      if (status.hasMCQs) {
        return { tabId: preferredTabId, ...status };
      }
    }

    // 2. Scan all other open tabs in tab manager
    const allTabs = Array.from(this.tabManager.tabs.entries());
    let bestTab = null;
    let highestScore = 0;

    for (const [tabId, _] of allTabs) {
      if (tabId === preferredTabId) continue;
      const status = await this._evaluateTabForMCQs(tabId);
      if (status.hasMCQs && status.score > highestScore) {
        highestScore = status.score;
        bestTab = { tabId, ...status };
      }
    }

    if (bestTab) {
      return bestTab;
    }

    return {
      tabId: preferredTabId,
      hasMCQs: false,
      isSequential: false,
      isMCQPage: false,
      optionCount: 0,
      timerText: '',
      title: '',
      url: '',
    };
  }

  /**
   * MCQ / Quiz auto-solver using a closed-loop Strawberry-style interaction process.

   * Flow: 
   * 1. Extract interactive page data and temporary IDs via PageContextEngine
   * 2. Build state model and decide semantic target via vision model
   * 3. Execute one visible operation using the target's explicit ID
   * 4. Verify result by reading the state again in the next loop iteration
   *
   * @param {string} tabId
   * @param {object} task
   * @param {object} assistantMsg
   * @param {string} auditEntryId
   * @param {string} originalCommand
   */
  async _solveMcqLoop(tabId, task, assistantMsg, auditEntryId, originalCommand, mcqModel) {
    return this._solveSequentialQuiz(tabId, task, assistantMsg, auditEntryId, originalCommand, { isSequential: true }, mcqModel);
  }
}

module.exports = { BrowserAgent };
