/**
 * Actra AI — Planner Engine
 *
 * Two-phase planner:
 *
 * Phase 1 — UNDERSTAND_REQUEST
 *   Determines intent, required Workspace apps, and whether approval is needed.
 *
 * Phase 2 — CREATE_PLAN
 *   Produces an ordered list of executable steps with riskLevel tags.
 */

class PlannerEngine {
  constructor(modelGateway, memoryStore) {
    this.modelGateway = modelGateway;
    this.memoryStore  = memoryStore;
  }

  /**
   * Phase 1: Understand the user's request.
   * @param {string} goal - The current user message
   * @param {Array} chatHistory - Previous chat messages
   * @returns {{ intent, goal, required_apps, required_data, planned_actions, approval_required }}
   */
  async understandRequest(goal, chatHistory = []) {
    if (!this.modelGateway.isAvailable()) {
      throw new Error('AI Model not available. Please set GROQ_API_KEY in .env');
    }

    const schema = {
      type: 'object',
      properties: {
        intent:           { type: 'string',  description: 'One sentence: what the user wants to accomplish' },
        goal:             { type: 'string',  description: 'Rephrased precise goal based on current and past context' },
        execution_target: {
          type: 'string',
          enum: ['INFORMATIONAL', 'GOOGLE_WORKSPACE_API', 'BROWSER_UI'],
          description: 'The primary target platform for execution.'
        },
        route: {
          type: 'string',
          enum: ['ACTION_SIMPLE', 'ACTION_COMPLEX'],
          description: 'Only applies if execution_target is BROWSER_UI. ACTION_SIMPLE for basic web navigation/clicks. ACTION_COMPLEX for research, scraping, or multi-step logic.'
        },
        simple_plan: {
          type: 'array',
          description: 'If route is ACTION_SIMPLE, provide the exact deterministic browser steps needed.',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['browser_navigate', 'browser_type', 'browser_click', 'browser_press_key', 'browser_scroll'] },
              description: { type: 'string', description: 'Human-readable description (e.g. "Opening YouTube")' },
              args: {
                type: 'object',
                properties: {
                  url: { type: 'string' },
                  targetDescription: { type: 'string' },
                  text: { type: 'string' },
                  key: { type: 'string' },
                  amount: { type: 'number' }
                }
              }
            },
            required: ['action', 'description']
          }
        },
        required_apps:    { type: 'array',   items: { type: 'string' }, description: 'Which Workspace apps are needed: gmail, calendar, sheets, drive, docs' },
        required_data:    { type: 'array',   items: { type: 'string' }, description: 'What data needs to be retrieved before acting' },
        planned_actions:  { type: 'array',   items: { type: 'string' }, description: 'High-level action names: search_gmail, send_email, get_calendar_events, write_sheet, etc.' },
        approval_required:{ type: 'boolean', description: 'True if any action will create external or irreversible side effects' }
      },
      required: ['intent', 'goal', 'execution_target', 'approval_required'],
    };

    const historyContext = chatHistory.length > 0
      ? `\nConversation History:\n${chatHistory.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n')}\n`
      : '';

    const prompt = `You are an intelligent assistant that plans Google Workspace actions for a user.
${historyContext}
User Request: "${goal}"

Analyze this request and return a structured JSON understanding of what the user wants. If the request is a follow-up, use the Conversation History for context.

Available Workspace actions:
READ (no approval needed): search_gmail, read_gmail_thread, get_calendar_events, read_sheet, search_drive
WRITE (approval required): send_email, write_sheet, update_sheet, create_doc, create_calendar_event, update_calendar_event
Browser read actions: browser_extract_page_text captures the readable text from the current page for later steps.

Rules for Routing:

You must output an \`execution_target\` choosing from:
- INFORMATIONAL
- GOOGLE_WORKSPACE_API
- BROWSER_UI

1. execution_target: INFORMATIONAL
- Use if the user is only asking a general question (e.g., "How does Gmail work?", "What is 2+2?").

2. execution_target: GOOGLE_WORKSPACE_API
- Use if the user wants to RETRIEVE, SEARCH, READ, SUMMARIZE, ANALYZE, CREATE, UPDATE, or otherwise operate on Google Workspace data.
- Examples: "Get my latest emails", "What's on my calendar tomorrow?", "Find my budget spreadsheet", "Send an email to John".
- The word "Gmail", "Drive", "Sheets", or "Calendar" alone MUST NOT cause browser navigation.
- Do NOT substitute browser automation for an existing backend capability. DO NOT open mail.google.com to read emails.

3. execution_target: BROWSER_UI
- Use ONLY when the user explicitly requests UI interaction, or for external websites without a dedicated backend integration.
- Examples of explicit UI requests: "Open Gmail", "Click the Inbox in Gmail", "Open this spreadsheet in the browser".
- Examples of external websites: "Open YouTube and play a MrBeast video", "Search Google for laptops", "Scroll down the article".
- Hybrid browser + Workspace requests MUST use BROWSER_UI if any external web page must be opened, searched, scrolled, or scraped, and MUST still list required Workspace apps such as "gmail" when the result will be emailed.
- For BROWSER_UI, you MUST specify \`route\`:
  - ACTION_SIMPLE for deterministic steps.
  - ACTION_COMPLEX for multi-step reasoning web agents.
- For ACTION_SIMPLE, you MUST populate \`simple_plan\` with the COMPLETE set of deterministic browser actions needed (browser_navigate, browser_type, browser_click, browser_press_key).
- If the user asks to capture, scrape, extract, research, summarize, or email page content after browser navigation, use ACTION_COMPLEX, not ACTION_SIMPLE.
- CRITICAL: If you type into a search box, you MUST include a \`browser_press_key\` step with key "Enter".
If the user says "send", "write", "create", "update", "draft" → approval_required = true

CRITICAL: YOU MUST OUTPUT ONLY RAW, VALID JSON. DO NOT WRAP YOUR RESPONSE IN MARKDOWN \`\`\`json BLOCKS. ANY TEXT OUTSIDE THE JSON WILL CAUSE A SYSTEM FAILURE.`;

    const { data } = await this.modelGateway.structuredOutput(prompt, schema);
    return data;
  }

  /**
   * Phase 2: Create the execution plan.
   * @param {object} understanding - Output of understandRequest()
   * @param {object} pageContext - Current page URL/title
   * @param {Array}  availableTools - Tool definitions
   * @param {Array}  chatHistory - Previous chat messages
   * @param {Array}  executionHistory - Results of steps taken in previous iterations
   * @returns {{ interpretation: string, steps: Array, isComplete: boolean }}
   */
  async createPlan(understanding, pageContext, availableTools, chatHistory = [], executionHistory = []) {
    if (!this.modelGateway.isAvailable()) {
      throw new Error('AI Model not available.');
    }

    const schema = {
      type: 'object',
      properties: {
        interpretation: { type: 'string', description: 'Brief explanation of what will happen' },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              action:      { type: 'string', description: 'Exact tool name from the available list' },
              description: { type: 'string', description: 'Human-readable step description' },
              args:        { type: 'object', description: 'Arguments to pass to the tool' },
              riskLevel:   { type: 'number', description: '0=read/safe, 2=write/requires approval' },
            },
            required: ['action', 'description', 'args', 'riskLevel'],
          },
        },
      },
      required: ['interpretation', 'steps'],
    };

    const toolDefs = availableTools.map(t => {
      const params = t.parameters?.properties || {};
      const paramList = Object.entries(params)
        .map(([k, v]) => `    ${k} (${v.type}): ${v.description || ''}`)
        .join('\n');
      return `- ${t.name}: ${t.description}\n  Parameters:\n${paramList}`;
    }).join('\n\n');

    const historyContext = chatHistory.length > 0
      ? `\nConversation History:\n${chatHistory.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n')}\n`
      : '';

    const executionHistoryContext = executionHistory.length > 0
      ? `\nExecution History (Steps Already Taken):\n${executionHistory.map((r, i) => `[Iter ${i+1}]: ${r.action} -> ${r.result}`).join('\n')}\n`
      : '';

    const prompt = `You are an autonomous AI agent generating a compact execution plan.
${historyContext}${executionHistoryContext}
User Intent: "${understanding.intent}"
Goal: "${understanding.goal}"

Current Page:
- URL: ${pageContext?.url || 'unknown'}
- Title: ${pageContext?.title || 'unknown'}

Available Tools:
${toolDefs}

Create a MACRO-PLAN to complete the task. Rules:
1. Generate the sequence of deterministic actions needed (e.g. navigate -> type -> press Enter).
2. For \`browser_click\` and \`browser_type\`, use a semantic description of the element (e.g. "search bar", "video thumbnail") in \`args.targetDescription\`. The local executor will find it. You do not need to provide exact element IDs.
3. Keep descriptions clean for the UI (e.g. "Opening YouTube", "Searching for MrBeast").
4. Assign riskLevel=0 for read ops, riskLevel=2 for write/send ops.
5. When a later step needs current page text, add \`browser_extract_page_text\` after the page is open and any requested scroll has happened.
6. When sending extracted page text by email, set \`send_email.args.body\` to the placeholder string \`{{browser_extract_page_text.text}}\` so the executor can insert the captured text before approval.
7. If the user asks for a known Wikipedia topic, prefer direct navigation to the canonical article URL, e.g. https://en.wikipedia.org/wiki/Tiger.
- Ensure you provide ALL necessary arguments to the tool according to its schema.

CRITICAL: YOU MUST OUTPUT ONLY RAW, VALID JSON. DO NOT WRAP YOUR RESPONSE IN MARKDOWN \`\`\`json BLOCKS. DO NOT ADD ANY CONVERSATIONAL TEXT.`;

    const { data } = await this.modelGateway.structuredOutput(prompt, schema);
    return data;
  }

  /**
   * Hard Completion Gate: Verifies if the goal was objectively achieved based on DOM state.
   */
  async verifyTaskCompletion(intent, pageContext, executionHistory = []) {
    if (!this.modelGateway.isAvailable()) {
      return { goal_state_reached: false, reason: 'AI Model not available for verification.', missing_requirements: [] };
    }

    const schema = {
      type: 'object',
      properties: {
        goal_state_reached: { type: 'boolean', description: 'True ONLY if the final desired outcome is visibly achieved' },
        reason: { type: 'string', description: 'Explanation of why it is or is not complete' },
        missing_requirements: { type: 'array', items: { type: 'string' }, description: 'Array of actions still needed (e.g. "Press Enter to submit search")' }
      },
      required: ['goal_state_reached', 'reason', 'missing_requirements'],
    };

    const executionHistoryContext = executionHistory.length > 0
      ? `\nExecution History:\n${JSON.stringify(executionHistory, null, 2)}\n`
      : '';

    const prompt = `You are a strict QA verification gate.
Your job is to objectively verify if the USER GOAL has been achieved based on the current FRESH browser state.

USER GOAL: "${intent}"

FRESH BROWSER STATE:
${JSON.stringify(pageContext, null, 2)}
${executionHistoryContext}

RULES:
1. "Action execution success" DOES NOT mean "Goal Success". If a query was typed but results aren't visible, the search task is NOT complete.
2. If "scroll to bottom" was requested, check the \`scroll.atBottom\` property. Do not assume scrolling succeeded just because the command ran.
3. Be pessimistic. If you do not see objective proof of completion (e.g., URL change, search results, confirmation messages), return goal_state_reached = false.
4. If false, list the exact \`missing_requirements\` needed next so the planner knows what to do.

Output raw JSON matching the schema.`;

    const { data } = await this.modelGateway.structuredOutput(prompt, schema);
    return data;
  }

  /**
   * Extremely compact LLM fallback for when the local semantic matcher cannot find the element.
   */
  async resolveElementFallback(targetDescription, compactDOM) {
    if (!this.modelGateway.isAvailable()) return null;

    const schema = {
      type: 'object',
      properties: {
        elementId: { type: 'string', description: 'The data-actra-id of the matched element, or empty if not found' }
      },
      required: ['elementId'],
    };

    const prompt = `You are a strict DOM parser.
Target Element Description: "${targetDescription}"

Compact DOM:
${JSON.stringify(compactDOM)}

Find the exact ID (e.g. el-5) that best matches the description. Return empty string if absolutely not found.`;

    try {
      const { data } = await this.modelGateway.structuredOutput(prompt, schema);
      return data.elementId || null;
    } catch {
      return null;
    }
  }
}

module.exports = PlannerEngine;
