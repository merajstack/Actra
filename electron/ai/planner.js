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
    if (this.modelGateway.getLastQuotaError && this.modelGateway.getLastQuotaError()) {
      throw this.modelGateway.getLastQuotaError();
    }
    if (!this.modelGateway.isAvailable()) {
      throw new Error('AI Model not available. Please configure your Cloudflare or Groq credentials in Settings (chrome://settings).');
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
- MUST BE USED for ANY request involving Gmail, emails, inbox, calendar, meetings, sheets, spreadsheets, docs, or drive.
- Examples: "Open my mail and check my mails", "Check if I got any emails about X", "What's on my calendar?", "Find my spreadsheet", "Send an email".
- ALWAYS check internally via Google Workspace APIs. NEVER open browser tabs or navigate to mail.google.com / docs.google.com.
- The browser has direct Google Workspace API authorization.

3. execution_target: BROWSER_UI
- Use ONLY for external non-workspace websites (e.g. YouTube, GitHub, Twitter, Amazon, Reddit, Wikipedia, search engines).
- Examples: "Open YouTube and play a video", "Search Google for laptops", "Visit reddit.com".
- NEVER use BROWSER_UI for checking or interacting with user emails, docs, sheets, drive, or calendar.
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
    if (this.modelGateway.getLastQuotaError && this.modelGateway.getLastQuotaError()) {
      throw this.modelGateway.getLastQuotaError();
    }
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
              action:              { type: 'string', description: 'Exact tool name from the available list' },
              description:         { type: 'string', description: 'Human-readable step description' },
              args:                { type: 'object', description: 'Arguments to pass to the tool' },
              riskLevel:           { type: 'number', description: '0=read/safe, 2=write/requires approval' },
              expectedPostState:   {
                type: ['string', 'null'],
                description: 'Optional. A short, testable description of the observable state that should be true AFTER this step succeeds. Examples: "url contains /results", "input value equals search text", "checkbox becomes checked", "button aria-selected equals true". Leave null for non-mutating steps (navigate, wait, extract).',
              },
              preferVision:        {
                type: 'boolean',
                description: 'Optional. True if step is on complex visual SPA domains (e.g. YouTube, media players, canvas apps) or when previous steps failed verification, to prefer vision grounding directly.',
              },
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
8. For \`search_gmail\`, use clean, concise keywords in \`args.query\` (e.g. 'Adobe hackathon' or 'Adobe' or 'Takeover'). Avoid exact quotes or conversational phrases.
9. HYBRID WORKFLOWS (Web Research / Page Extraction + Send Email):
   - When the user asks to open a website (e.g. Wikipedia, article, search), research/extract data, and send an email:
     Step 1: \`browser_navigate\` to the target website URL (e.g. https://en.wikipedia.org/wiki/Peafowl).
     Step 2: \`browser_extract_page_text\` to capture the page content (and/or \`browser_take_screenshot\` if requested).
     Step 3: \`send_email\` with recipient in \`args.to\`, descriptive \`args.subject\`, and \`args.body\` set to \`{{browser_extract_page_text.text}}\` (riskLevel: 2).
   - NEVER call \`search_gmail\` when the goal is to research an external site and SEND an email.
- Ensure you provide ALL necessary arguments to the tool according to its schema.
10. For every mutating step (\`browser_click\`, \`browser_type\`), set \`expectedPostState\` to a short testable assertion about what should be observable after the step (e.g. "input value equals search query", "aria-checked equals true", "url contains /dashboard"). For non-mutating steps (navigate, wait, extract) leave \`expectedPostState\` as null.
11. For complex visual SPAs (like YouTube, media sites, canvas web apps) or when execution history indicates verification failure, set \`preferVision: true\` on click/type steps so the executor bypasses fragile DOM heuristics and prioritizes visual grounding.

CRITICAL: YOU MUST OUTPUT ONLY RAW, VALID JSON. DO NOT WRAP YOUR RESPONSE IN MARKDOWN \`\`\`json BLOCKS. DO NOT ADD ANY CONVERSATIONAL TEXT.`;

    const { data } = await this.modelGateway.structuredOutput(prompt, schema);
    return data;
  }

  /**
   * Hard Completion Gate: Verifies if the goal was objectively achieved based on DOM state.
   */
  async verifyTaskCompletion(intent, pageContext, executionHistory = []) {
    if (this.modelGateway.getLastQuotaError && this.modelGateway.getLastQuotaError()) {
      return { goal_state_reached: false, reason: this.modelGateway.getLastQuotaError().message, missing_requirements: [] };
    }
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
  /**
   * Answer a batch of MCQ questions in a single structured LLM call.
   *
   * @param {Array<{question: string, options: string[]}>} questions
   * @param {string} pageText    Full page text for additional context
   * @param {string} [mcqModel]  Optional Cloudflare model ID from the subject dropdown.
   *                             When provided, overrides the default planner model.
   * @returns {Promise<Array<{answer_index: number, confidence: number, reasoning: string}>>}
   */
  async answerMCQBatch(questions, pageText = '', mcqModel) {
    if (this.modelGateway.getLastQuotaError && this.modelGateway.getLastQuotaError()) {
      throw this.modelGateway.getLastQuotaError();
    }
    if (!this.modelGateway.isAvailable()) {
      throw new Error('AI Model not available.');
    }

    const schema = {
      type: 'object',
      properties: {
        answers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              answer_index: { type: 'number', description: '0-based index of the correct option in the options array' },
              confidence:   { type: 'number', description: 'Confidence score between 0 and 1 (e.g. 0.9 = very confident)' },
              reasoning:    { type: 'string', description: 'One-sentence explanation of why this option is correct' },
            },
            required: ['answer_index', 'confidence', 'reasoning'],
          },
          description: 'One answer object per question, in the same order as the input questions array',
        },
      },
      required: ['answers'],
    };

    const questionsText = questions.map((q, i) => {
      const opts = q.options.map((o, j) => `  ${j}. ${o}`).join('\n');
      return `Question ${i + 1}: ${q.question}\nOptions:\n${opts}`;
    }).join('\n\n');

    const pageSnippet = pageText ? `\n\nPage context (first 4000 chars):\n${pageText.slice(0, 4000)}` : '';

    const prompt = `You are an expert exam solver. Answer every question below accurately.
For each question return the 0-based index of the SINGLE correct option, a confidence score (0–1), and a short reasoning string.
Return answers in the SAME ORDER as the questions.${pageSnippet}

${questionsText}

CRITICAL: Output only raw valid JSON. Do NOT wrap in markdown code fences.`;

    const { data } = await this.modelGateway.structuredOutput(prompt, schema, {
      temperature: 0.05,
      role: 'planner',
      ...(mcqModel ? { model: mcqModel } : {}),
    });

    return Array.isArray(data?.answers) ? data.answers : [];
  }
}

module.exports = PlannerEngine;
