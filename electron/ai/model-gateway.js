/**
 * Actra AI — Model Gateway (Groq)
 * 
 * Abstraction layer for AI model providers. Uses Groq via REST API
 * (OpenAI compatibility layer).
 * 
 * Capabilities:
 * - chat() — conversational completion
 * - toolCall() — function calling / tool use
 * - structuredOutput() — JSON schema extraction (via json_object)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const supabase = require('../supabase');

// ─── Model Registry ─────────────────────────────────────────────────────────
// To swap any model: change one line here. Nothing else in the codebase needs updating.
const MODELS = {
  // Fast 70B — everyday chat, Gmail summarization, page extraction
  chat:    '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  // Dedicated reasoning — multi-step agentic plans, tool selection, complex tasks
  planner: '@cf/openai/gpt-oss-120b',
  // Best-in-class coding — code gen, debug, GitHub README, technical Q&A
  coding:  '@cf/qwen/qwen2.5-coder-32b-instruct',
  // Multimodal MoE — screenshot analysis, MCQ solving, UI-TARS visual_interact
  vision:  '@cf/meta/llama-4-scout-17b-16e-instruct',
};

// Auto-detection patterns (used when caller passes role: 'auto' or omits role)
const CODING_PATTERN  = /\b(code|function|class|debug|fix (the )?(bug|error|issue)|write (a |the )?(script|program|function)|refactor|sql|regex|algorithm|typescript|javascript|python|rust|golang|java|c\+\+|html|css|bash|shell)\b/i;
const VISION_PATTERN  = /\b(screenshot|image|picture|photo|visual|mcq|question|option|select|click|what('?s| is) (on|in) (the |this )?(screen|image|page)|analyze (this|the) (image|screenshot|page))\b/i;
const PLANNER_PATTERN = /\b(plan|step|steps|how (do|can|should) i|workflow|automate|agent|task|execute|sequence|first.*then|open.*and.*then|do (the )?following)\b/i;

const CLOUDFLARE_INVALID_ACCOUNT_MESSAGE = 'Invalid key/account id, please check and replace them in settings.';
const ACTRA_AI_DAILY_LIMIT_MESSAGE = 'Actra AI daily limit finished, it resets at 00:00';
const CLOUDFLARE_GENERIC_MESSAGE = 'Cloudflare request failed. Please try again later.';

/**
 * Typed error thrown when ALL available model backends are exhausted due to quota/auth.
 * Callers should check `err.isModelQuotaError === true` to detect this case.
 */
class ModelQuotaError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ModelQuotaError';
    this.code = code;
    this.isModelQuotaError = true;
  }
}

/**
 * Build the correct ModelQuotaError for the two quota failure modes.
 *
 * @param {'no_fallback'|'fallback_failed'} mode
 * @param {string} [groqReason]  Short reason why Groq also failed (fallback_failed only)
 */
function createQuotaError(mode, groqReason) {
  if (mode === 'no_fallback') {
    return new ModelQuotaError(
      'AI model limit reached for today (resets at 00:00) and no backup model is configured. ' +
      'Add a Groq API key in Settings to avoid this, or try again after reset.',
      'QUOTA_NO_FALLBACK'
    );
  }
  // mode === 'fallback_failed'
  const reason = groqReason || 'unknown error';
  return new ModelQuotaError(
    `AI model limit reached for today, and the backup model (Groq) also failed: ${reason}. ` +
    'Please check your Groq API key in Settings or try again later.',
    'QUOTA_FALLBACK_FAILED'
  );
}

/**
 * Classify a raw Groq error into a short human-readable reason string.
 * Used in the second quota error message.
 */
function classifyGroqError(err) {
  const msg = (err?.message || '').toLowerCase();
  if (
    msg.includes('invalid api key') ||
    msg.includes('invalid_api_key') ||
    msg.includes('incorrect api key') ||
    msg.includes('authentication') ||
    msg.includes('unauthorized') ||
    /\b401\b/.test(msg)
  ) return 'invalid API key';
  if (
    msg.includes('rate limit') ||
    msg.includes('rate_limit') ||
    msg.includes('too many requests') ||
    /\b429\b/.test(msg)
  ) return 'Groq rate limited';
  if (
    msg.includes('quota') ||
    msg.includes('exceeded') ||
    msg.includes('billing')
  ) return 'Groq quota exceeded';
  if (
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('abort')
  ) return 'Groq request timed out';
  if (
    msg.includes('not found') ||
    msg.includes('404')
  ) return 'Groq API not found';
  if (msg.includes('network') || msg.includes('fetch')) return 'network error reaching Groq';
  // Return the first ~80 chars of the raw message as a fallback summary
  return (err?.message || 'unknown error').slice(0, 80);
}

function createCloudflareUserError(message, code) {
  const error = new Error(message);
  error.code = code;
  error.isCloudflareUserError = true;
  return error;
}

function readCloudflareErrorText(body) {
  if (!body) return '';
  if (typeof body === 'string') {
    try {
      return readCloudflareErrorText(JSON.parse(body));
    } catch {
      return body;
    }
  }

  const parts = [];
  const collect = (value) => {
    if (!value) return;
    if (typeof value === 'string' || typeof value === 'number') {
      parts.push(String(value));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (typeof value === 'object') {
      collect(value.message);
      collect(value.code);
      collect(value.error);
      collect(value.errors);
      collect(value.detail);
      collect(value.details);
    }
  };

  collect(body);
  return parts.join(' ');
}

function getCloudflareUserMessage(status, body) {
  const text = readCloudflareErrorText(body).toLowerCase();

  if (
    status === 429 ||
    /\b(rate[-\s]?limit|daily|quota|usage|capacity|too many|exceeded|limit reached|insufficient|not enough)\b/.test(text)
  ) {
    return { message: ACTRA_AI_DAILY_LIMIT_MESSAGE, code: 'ACTRA_AI_DAILY_LIMIT' };
  }

  if (
    status === 401 ||
    status === 403 ||
    status === 404 ||
    /\b(auth|authenticate|unauthorized|forbidden|permission|token|account|credential|invalid key|invalid token|invalid account|not found)\b/.test(text)
  ) {
    return { message: CLOUDFLARE_INVALID_ACCOUNT_MESSAGE, code: 'CLOUDFLARE_INVALID_ACCOUNT' };
  }

  if (text) {
    // Return clean descriptive message from Cloudflare
    return { message: `Cloudflare AI Error: ${readCloudflareErrorText(body)}`, code: 'CLOUDFLARE_API_ERROR' };
  }

  return { message: CLOUDFLARE_GENERIC_MESSAGE, code: 'CLOUDFLARE_REQUEST_FAILED' };
}

class ModelGateway {
  constructor() {
    // Legacy Groq defaults — only used when Cloudflare is not configured
    this.defaultModel   = 'llama-3.1-8b-instant';
    this.reasoningModel = 'llama-3.1-70b-versatile';
    this.baseUrl        = 'https://api.groq.com/openai/v1/chat/completions';
    this.modelsUrl      = 'https://api.groq.com/openai/v1/models';

    this.totalTokensUsed = 0;
    this.tokenBudget     = Infinity;
    this.availableModels = null;
    this.fetchingModels  = null;
    this._lastQuotaError = null;
  }

  getLastQuotaError() {
    return this._lastQuotaError || null;
  }

  isQuotaExhausted() {
    return Boolean(this._lastQuotaError);
  }

  clearQuotaError() {
    this._lastQuotaError = null;
  }

  async checkAvailability() {
    if (this._lastQuotaError) {
      throw this._lastQuotaError;
    }
    const { accountId: cfAccountId, apiToken: cfApiToken } = await this.getCloudflareCredentials();
    const groqKey = await this.getApiKey();
    if (!cfAccountId && !cfApiToken && !groqKey) {
      throw new Error('AI credentials not configured. Please set your Groq API Key in Settings (chrome://settings).');
    }
    return true;
  }

  /**
   * Resolve the correct Cloudflare model for a given role.
   * Falls back to auto-detecting from prompt content when role is 'auto'.
   * Callers can also pass options.model to hard-pin a specific model ID.
   *
   * @param {string} role  'chat' | 'planner' | 'coding' | 'vision' | 'auto'
   * @param {string} [promptHint]  Optional prompt text for auto-detection
   * @returns {string} Cloudflare model ID
   */
  resolveRole(role, promptHint = '') {
    // Hard-pinned model ID from caller
    if (role && role.startsWith('@cf/')) return role;
    // Named role from registry
    if (role && MODELS[role]) {
      console.log(`[ModelGateway] Role: "${role}" → ${MODELS[role]}`);
      return MODELS[role];
    }
    // Auto-detect from prompt content
    if (!role || role === 'auto') {
      if (VISION_PATTERN.test(promptHint))  { console.log('[ModelGateway] Auto-role: vision');  return MODELS.vision; }
      if (CODING_PATTERN.test(promptHint))  { console.log('[ModelGateway] Auto-role: coding');  return MODELS.coding; }
      if (PLANNER_PATTERN.test(promptHint)) { console.log('[ModelGateway] Auto-role: planner'); return MODELS.planner; }
      console.log('[ModelGateway] Auto-role: chat (default)');
      return MODELS.chat;
    }
    console.warn(`[ModelGateway] Unknown role "${role}", falling back to chat model`);
    return MODELS.chat;
  }

  async getCloudflareCredentials() {
    let accountId = null;
    let apiToken = null;

    try {
      const { default: Store } = await import('electron-store');
      const localStore = new Store({ name: 'config', projectName: 'Actra' });
      const storeAcc = localStore.get('cloudflareAccountId');
      const storeKey = localStore.get('cloudflareApiKey');
      if (storeAcc && typeof storeAcc === 'string' && storeAcc.trim().length > 5) accountId = storeAcc.trim();
      if (storeKey && typeof storeKey === 'string' && storeKey.trim().length > 5) apiToken = storeKey.trim();
    } catch (e) {}

    if (!accountId || !apiToken) {
      try {
        const { data: accData } = await supabase.from('settings').select('value').eq('key', 'cloudflareAccountId').single();
        const { data: keyData } = await supabase.from('settings').select('value').eq('key', 'cloudflareApiKey').single();
        if (accData?.value && typeof accData.value === 'string' && accData.value.trim().length > 5) accountId = accData.value.trim();
        if (keyData?.value && typeof keyData.value === 'string' && keyData.value.trim().length > 5) apiToken = keyData.value.trim();
      } catch (e) {}
    }

    return { accountId, apiToken };
  }

  async getApiKey() {
    try {
      const { default: Store } = await import('electron-store');
      const localKey = new Store({ name: 'config', projectName: 'Actra' }).get('groqKey');
      if (localKey && typeof localKey === 'string' && localKey.trim().length > 5) return localKey.trim();
    } catch (e) {}
    try {
      const { data } = await supabase.from('settings').select('value').eq('key', 'groqKey').single();
      if (data?.value && typeof data.value === 'string' && data.value.trim().length > 5) return data.value.trim();
    } catch (e) {}
    return null;
  }

  isAvailable() {
    if (this._lastQuotaError) return false;
    return true;
  }

  async _fetchGroq(payload) {
    const key = await this.getApiKey();
    if (!key) {
      throw new Error('Groq API Key is not configured. Please enter your Groq API Key in Settings (chrome://settings).');
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const compactPayload = this._compactPayload(payload);
    const payloadStr = JSON.stringify(compactPayload);
    console.log(`[ModelGateway] Sending payload. Size: ${payloadStr.length} chars. Model: ${payload.model}`);

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: payloadStr,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 413) {
          throw new Error('Groq rejected the request because the conversation or page context was too large. Actra shortened the context, but please start a new chat if this continues.');
        }
        throw new Error(`Groq API Error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      const tokens = data.usage?.total_tokens || 0;
      this.totalTokensUsed += tokens;
      this._checkBudget();

      return { data, tokensUsed: tokens };
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Groq API Error: Request timed out after 15 seconds');
      }
      throw error;
    }
  }

  _compactPayload(payload) {
    const compact = { ...payload };
    if (Array.isArray(payload.messages)) {
      const messages = payload.messages.map((message) => {
        if (typeof message.content !== 'string') return message;
        
        // Extract base64 image if present to support vision models
        const imageMatch = message.content.match(/(data:image\/[^;]+;base64,[A-Za-z0-9+/=]+)/);
        if (imageMatch) {
          const base64Str = imageMatch[1];
          const textWithoutImage = message.content.replace(base64Str, '').trim();
          return {
            ...message,
            content: [
              { type: 'text', text: textWithoutImage || 'Please analyze this image.' },
              { type: 'image_url', image_url: { url: base64Str } }
            ]
          };
        }

        const limit = message.role === 'system' ? 8000 : 3500;
        if (message.content.length <= limit) return message;
        return {
          ...message,
          content: `${message.content.slice(0, Math.floor(limit * 0.65))}\n[context shortened by Actra]\n${message.content.slice(-Math.floor(limit * 0.35))}`,
        };
      });

      // Keep the system prompt and the most recent context. Old assistant/tool
      // output is the usual source of oversized requests.
      let selected = messages;
      
      const getPayloadSize = (msgs) => {
        const clone = JSON.parse(JSON.stringify(msgs));
        clone.forEach(m => {
          if (Array.isArray(m.content)) {
            m.content.forEach(c => {
              if (c.type === 'image_url') c.image_url.url = '';
            });
          }
        });
        return JSON.stringify({ ...compact, messages: clone }).length;
      };

      while (getPayloadSize(selected) > 32000 && selected.length > 2) {
        const firstNonSystem = selected.findIndex(message => message.role !== 'system');
        if (firstNonSystem < 0) break;
        selected = selected.slice(0, firstNonSystem).concat(selected.slice(firstNonSystem + 1));
      }
      compact.messages = selected;
    }

    if (Array.isArray(payload.tools)) {
      compact.tools = payload.tools.map(tool => ({
        ...tool,
        function: tool.function ? {
          ...tool.function,
          description: typeof tool.function.description === 'string'
            ? tool.function.description.slice(0, 1200)
            : tool.function.description,
        } : tool.function,
      }));
    }
    return compact;
  }

  async _fetchWithFallback(payload, isReasoning = false) {
    payload = this._compactPayload(payload);
    
    const { accountId: cfAccountId, apiToken: cfApiToken } = await this.getCloudflareCredentials();
    const groqKey = await this.getApiKey();

    if (this._lastQuotaError) {
      throw this._lastQuotaError;
    }

    if (!cfAccountId && !cfApiToken && !groqKey) {
      throw new Error('AI credentials not configured. Please set your Groq API Key in Settings (chrome://settings).');
    }

    // Track whether Cloudflare hit a quota/rate-limit error so we can emit the
    // right user-facing message when the Groq fallback also fails.
    let cfWasQuotaError = false;

    // ── Cloudflare path: only attempt if BOTH account ID and API token are present ──
    if (cfAccountId && cfApiToken) {
      try {
        const model = payload.model;
        console.log(`[ModelGateway] Cloudflare → ${model} (account: ${cfAccountId.slice(0,8)}…)`);
        const url = `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/v1/chat/completions`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        const cfPayload = { ...payload }; // model already set by caller

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cfApiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(cfPayload),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[ModelGateway] Cloudflare HTTP ${response.status}: ${errorText.slice(0, 300)}`);
          const { message, code } = getCloudflareUserMessage(response.status, errorText);
          throw createCloudflareUserError(message, code);
        }

        const cfData = await response.json();
        
        const isNativeOpenAI = cfData.choices !== undefined;
        if (!isNativeOpenAI && !cfData.success) {
          const { message, code } = getCloudflareUserMessage(response.status, cfData);
          throw createCloudflareUserError(message, code);
        }
        
        console.log(`[ModelGateway] Cloudflare request succeeded!`);
        this._lastQuotaError = null;
        
        if (isNativeOpenAI) {
          cfData.result = cfData;
        }
        
        let textContent = '';
        let toolCalls = null;

        if (cfData.result) {
          if (typeof cfData.result === 'string') {
            textContent = cfData.result;
          } else if (cfData.result.response !== undefined) {
            textContent = cfData.result.response;
          } else if (cfData.result.choices && cfData.result.choices[0]?.message) {
            textContent = cfData.result.choices[0].message.content || '';
            if (cfData.result.choices[0].message.tool_calls) {
              toolCalls = cfData.result.choices[0].message.tool_calls;
            }
          }
        }
        
        if (!toolCalls && cfData.result && cfData.result.tool_calls) {
          toolCalls = cfData.result.tool_calls;
        }

        const data = {
          choices: [{ message: { content: textContent, ...(toolCalls ? { tool_calls: toolCalls } : {}) } }],
          usage: { total_tokens: 0 }
        };

        return { data, tokensUsed: 0 };

      } catch (rawCfError) {
        // Use `let` so we can replace the raw AbortError with a typed user error.
        let cfError = rawCfError;
        if (cfError.name === 'AbortError') {
          cfError = createCloudflareUserError('Cloudflare request timed out.', 'CLOUDFLARE_TIMEOUT');
        }

        // Record whether this was a quota/rate-limit hit so the Groq catch block
        // below can emit the correct two-tier user-facing message.
        cfWasQuotaError = (cfError.code === 'ACTRA_AI_DAILY_LIMIT');

        if (groqKey) {
          // Groq is available — fall through silently; never surface CF noise to the user.
          console.warn(`[ModelGateway] Cloudflare failed (${cfError.message}). Falling back to Groq.`);
        } else {
          // No fallback available — surface the most actionable error we can.
          console.error(`[ModelGateway] Cloudflare failed with no Groq fallback: ${cfError.message}`);
          // Case 1: quota exhausted, no Groq key at all → clear user-facing quota message.
          if (cfWasQuotaError) {
            const quotaErr = createQuotaError('no_fallback');
            this._lastQuotaError = quotaErr;
            throw quotaErr;
          }
          throw cfError.isCloudflareUserError
            ? cfError
            : createCloudflareUserError(CLOUDFLARE_GENERIC_MESSAGE, 'CLOUDFLARE_REQUEST_FAILED');
        }
      }
    }

    // ── Groq path (primary if no CF keys, fallback if CF failed) ──
    if (!groqKey) {
      throw new Error('No AI credentials configured. Please add your Groq API Key in Settings (chrome://settings).');
    }

    // Map CF model role back to a valid Groq model
    const resolvedGroqModel = await this._cfModelToGroq(payload.model);
    console.log(`[ModelGateway] Groq fallback → ${resolvedGroqModel}`);
    try {
      const result = await this._fetchGroq({ ...payload, model: resolvedGroqModel });
      this._lastQuotaError = null;
      return result;
    } catch (groqErr) {
      // Case 2: Cloudflare previously hit a quota error and Groq also fails.
      // Emit the user-friendly two-tier message instead of raw Groq noise.
      if (cfWasQuotaError) {
        const reason = classifyGroqError(groqErr);
        console.error(`[ModelGateway] CF quota + Groq fallback also failed (${reason}): ${groqErr.message}`);
        const quotaErr = createQuotaError('fallback_failed', reason);
        this._lastQuotaError = quotaErr;
        throw quotaErr;
      }
      // Groq was the primary provider and it failed — re-throw as-is.
      throw groqErr;
    }
  }


  /**
   * Map a Cloudflare model ID to the closest available Groq model.
   * @param {string} cfModel
   */
  async _cfModelToGroq(cfModel) {
    await this._ensureModels();
    const models = this.availableModels || [];
    const textModels = models.filter(m =>
      !m.includes('whisper') && !m.includes('audio') && !m.includes('guard') &&
      !m.includes('speech')  && !m.includes('embedding')
    );
    if (cfModel === MODELS.planner || cfModel === MODELS.coding) {
      return textModels.find(m => m.includes('70b') || m.includes('120b')) || this.reasoningModel;
    }
    return textModels.find(m => m.includes('8b') || m.includes('instant')) || this.defaultModel;
  }

  async _ensureModels() {
    if (!this.isAvailable()) return;
    if (this.availableModels) return;
    if (this.fetchingModels) return this.fetchingModels;
    
    this.fetchingModels = (async () => {
      try {
        const key = await this.getApiKey();
        const response = await fetch(this.modelsUrl, {
          headers: { 'Authorization': `Bearer ${key}` }
        });
        if (response.ok) {
          const data = await response.json();
          this.availableModels = data.data.map(m => m.id);
        } else {
          this.availableModels = [];
        }
      } catch (e) {
        this.availableModels = [];
      }
    })();
    return this.fetchingModels;
  }

  async resolveModel(requestedModel, isReasoning = false) {
    await this._ensureModels();
    console.log('[ModelGateway] Available models in resolveModel:', this.availableModels);
    if (!this.availableModels || this.availableModels.length === 0) return requestedModel;
    
    if (this.availableModels.includes(requestedModel)) return requestedModel;

    // Sandbox proxy mappings to avoid picking low-context models
    if (requestedModel.includes('8b') || requestedModel.includes('instant')) {
      if (this.availableModels.includes('llama-3.1-8b-instant')) return 'llama-3.1-8b-instant';
      if (this.availableModels.includes('llama3-8b-8192')) return 'llama3-8b-8192';
    }
    if (requestedModel.includes('70b') || requestedModel.includes('versatile')) {
      if (this.availableModels.includes('llama-3.1-70b-versatile')) return 'llama-3.1-70b-versatile';
      if (this.availableModels.includes('llama3-70b-8192')) return 'llama3-70b-8192';
    }
    
    // Filter out audio/vision/guard models
    const textModels = this.availableModels.filter(m => 
      !m.includes('whisper') && !m.includes('vision') && !m.includes('audio') && !m.includes('guard') && !m.includes('speech') && !m.includes('embedding')
    );

    if (textModels.length === 0) return requestedModel;

    // For reasoning tasks, try to find a large model
    if (isReasoning) {
       const large = textModels.find(m => m.includes('70b') || m.includes('120b') || m.includes('90b') || m.includes('27b'));
       if (large) return large;
    } else {
       // For standard chat tasks, try to find a fast model
       const fast = textModels.find(m => m.includes('8b') || m.includes('7b') || m.includes('mini') || m.includes('instant'));
       if (fast) return fast;
    }
    
    // Fallback to anything
    return textModels.find(m => m.includes('llama')) || textModels.find(m => m.includes('qwen')) || textModels[0];
  }

  /**
   * Conversational completion.
   * @param {Array}  messages
   * @param {object} options
   * @param {string} [options.role]              'chat' | 'planner' | 'coding' | 'vision' | 'auto'
   * @param {string} [options.model]             Hard-pin a specific model ID (overrides role)
   * @param {string} [options.systemInstruction]
   * @param {number} [options.temperature]
   * @param {number} [options.maxTokens]
   */
  async chat(messages, options = {}) {
    const promptHint = messages.map(m => typeof m.content === 'string' ? m.content : '').join(' ');
    const model      = options.model || this.resolveRole(options.role || 'auto', promptHint);
    const sysMsg = options.systemInstruction ? [{ role: 'system', content: options.systemInstruction }] : [];
    
    const payload = {
      model,
      messages:    [...sysMsg, ...messages],
      temperature: options.temperature ?? 0.7,
      max_tokens:  options.maxTokens   ?? 1024,
    };

    const { data, tokensUsed } = await this._fetchWithFallback(payload, false);
    const rawText = data.choices[0]?.message?.content || '';
    return { text: this._stripReasoning(rawText), tokensUsed };
  }

  /**
   * Tool / function calling.
   * @param {Array}  messages
   * @param {Array}  tools
   * @param {object} options
   * @param {string} [options.role]  Defaults to 'planner' — best for function calling + reasoning
   */
  async toolCall(messages, tools, options = {}) {
    const promptHint = messages.map(m => typeof m.content === 'string' ? m.content : '').join(' ');
    // Planner is default for tool calls — has native function calling + step reasoning
    const model  = options.model || this.resolveRole(options.role || 'planner', promptHint);
    const sysMsg = options.systemInstruction ? [{ role: 'system', content: options.systemInstruction }] : [];

    const groqTools = tools.map(t => ({
      type: 'function',
      function: {
        name:        t.name,
        description: t.description,
        parameters:  t.parameters || { type: 'object', properties: {} }
      }
    }));

    const payload = {
      model,
      messages:    [...sysMsg, ...messages],
      tools:       groqTools,
      tool_choice: 'auto',
      temperature: options.temperature ?? 0.3,
    };

    const { data, tokensUsed } = await this._fetchWithFallback(payload, false);
    const message = data.choices[0]?.message;

    if (message?.tool_calls?.length > 0) {
      const toolCalls = message.tool_calls.map(tc => {
        let args = {};
        try { args = JSON.parse(tc.function.arguments); } catch(e) {}
        return { name: tc.function.name, args };
      });
      return { toolCalls, tokensUsed };
    }

    const rawText = message?.content || '';
    return { text: this._stripReasoning(rawText), tokensUsed };
  }

  /**
   * Structured JSON output extraction.
   * @param {string} prompt
   * @param {object} schema   JSON Schema object
   * @param {object} options
   * @param {string} [options.role]  Defaults to 'planner' — best for structured reasoning
   */
  async structuredOutput(prompt, schema, options = {}) {
    const model = options.model || this.resolveRole(options.role || 'planner', prompt);
    // Groq requires JSON output instruction in the prompt
    const sysMsg = [{ 
      role: 'system', 
      content: `${options.systemInstruction || 'You are a helpful assistant.'}\nOutput your response ONLY in valid JSON matching this schema:\n${JSON.stringify(schema)}`
    }];

    const payload = {
      model,
      messages: [...sysMsg, { role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: options.temperature ?? 0.1,
    };

    const { data, tokensUsed } = await this._fetchWithFallback(payload, false);
    let text = data.choices[0]?.message?.content || '{}';
    let parsedData;
    
    if (typeof text !== 'string') {
      // Cloudflare sometimes auto-parses JSON responses natively.
      parsedData = text;
    } else {
      // Strip reasoning blocks BEFORE any JSON parsing attempt
      text = this._stripReasoning(text);
      let cleanedText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      try {
        parsedData = JSON.parse(cleanedText);
      } catch {
        // Fallback: try to extract JSON block if there's conversational text mixed in
        const match = cleanedText.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            parsedData = JSON.parse(match[0]);
          } catch {
            parsedData = { raw: text };
          }
        } else {
          parsedData = { raw: text };
        }
      }
    }

    return { data: parsedData, tokensUsed };
  }

  /**
   * Vision inference — sends a screenshot + text prompt to the vision model.
   * Used by visual_interact in BrowserAgent (MCQ solving, UI-TARS).
   *
   * @param {string} base64Image  data:image/... base64 string
   * @param {string} textPrompt   What to ask about the image
   * @param {object} [options]
   */
  async visionChat(base64Image, textPrompt, options = {}) {
    const { accountId: cfAccountId, apiToken: cfApiToken } = await this.getCloudflareCredentials();
    if (!cfAccountId || !cfApiToken) {
      throw new Error('Vision requires Cloudflare credentials. Please configure them in Settings (chrome://settings).');
    }
    // Guard: ensure text-only models are never sent image payloads
    const textOnlyModels = [
      '@cf/qwen/qwen2.5-coder-32b-instruct',
      '@cf/openai/gpt-oss-120b',
      MODELS.chat,
      MODELS.planner,
      MODELS.coding,
    ];
    let targetModel = options.model || MODELS.vision;
    if (textOnlyModels.includes(targetModel)) {
      console.warn(`[ModelGateway] visionChat received text-only model "${targetModel}" — falling back to multimodal model "${MODELS.vision}".`);
      targetModel = MODELS.vision;
    }

    const payload = {
      model: targetModel,
      messages: [{
        role: 'user',
        content: [
          { type: 'text',      text: textPrompt },
          { type: 'image_url', image_url: { url: base64Image } },
        ],
      }],
      temperature: options.temperature ?? 0.1,
      max_tokens:  options.maxTokens   ?? 512,
    };
    // hasImages = true → skip compaction so base64 data is preserved
    const { data, tokensUsed } = await this._fetchWithFallback(payload, true);
    const rawText = data.choices[0]?.message?.content || '';
    return { text: this._stripReasoning(rawText), tokensUsed };
  }

  // Budget
  setTokenBudget(budget) { this.tokenBudget = budget; }
  getTokensUsed() { return this.totalTokensUsed; }
  resetTokenCounter() { this.totalTokensUsed = 0; }

  _checkBudget() {
    if (this.totalTokensUsed >= this.tokenBudget) {
      console.warn(`[ModelGateway] Token budget exceeded: ${this.totalTokensUsed}/${this.tokenBudget}`);
    }
  }

  _stripReasoning(text) {
    if (typeof text !== 'string') return text;
    // 1. Remove complete <think>...</think> blocks
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>\n?/gi, '');
    
    // 2. Handle missing opening <think> tag (model just outputs thoughts then </think>)
    if (cleaned.includes('</think>')) {
      cleaned = cleaned.split('</think>').pop();
    }
    
    // 3. Handle missing closing </think> tag (model ran out of tokens before finishing thoughts)
    if (cleaned.includes('<think>')) {
      cleaned = cleaned.split('<think>')[0];
    }
    
    // Also remove markdown <think> blocks if the model wrapped it in codeblocks
    cleaned = cleaned.replace(/```[a-z]*\n<think>[\s\S]*?<\/think>\n```\n?/gi, '');
    
    return cleaned.trim();
  }
}

module.exports = ModelGateway;
module.exports.ModelQuotaError = ModelQuotaError;
