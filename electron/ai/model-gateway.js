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

const CLOUDFLARE_INVALID_ACCOUNT_MESSAGE = 'Invalid key/account id, please check and replace them in settings.';
const ACTRA_AI_DAILY_LIMIT_MESSAGE = 'Actra AI daily limit finished, it resets at 00:00';
const CLOUDFLARE_GENERIC_MESSAGE = 'Cloudflare request failed. Please try again later.';

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

  return { message: CLOUDFLARE_GENERIC_MESSAGE, code: 'CLOUDFLARE_REQUEST_FAILED' };
}

class ModelGateway {
  constructor() {
    this.defaultModel = 'llama-3.1-8b-instant'; // fast default
    this.reasoningModel = 'llama-3.3-70b-versatile'; // powerful model
    this.baseUrl = 'https://api.groq.com/openai/v1/chat/completions';
    this.modelsUrl = 'https://api.groq.com/openai/v1/models';
    
    this.totalTokensUsed = 0;
    this.tokenBudget = Infinity;

    this.availableModels = null;
    this.fetchingModels = null;
  }

  async getApiKey() {
    try {
      const { default: Store } = await import('electron-store');
      const localKey = new Store({ name: 'config', projectName: 'Actra' }).get('groqKey');
      if (localKey) return localKey;
    } catch (e) {}
    try {
      const { data } = await supabase.from('settings').select('value').eq('key', 'groqKey').single();
      if (data?.value) return data.value;
    } catch (e) {}
    return process.env.GROQ_API_KEY;
  }

  isAvailable() {
    return true; // Cloudflare gpt-oss-120b is always available as first priority
  }

  async _fetchGroq(payload) {
    const key = await this.getApiKey();
    if (!key || key === 'YOUR_GROQ_API_KEY') {
      throw new Error('Groq API Key is not configured. Please set GROQ_API_KEY in .env or via onboarding.');
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
    try {
      console.log(`[ModelGateway] Attempting Cloudflare AI: gpt-oss-120b`);
      
      let cfAccountId;
      let cfApiToken;

      try {
        const { default: Store } = await import('electron-store');
        const localStore = new Store({ name: 'config', projectName: 'Actra' });
        cfAccountId = localStore.get('cloudflareAccountId');
        cfApiToken = localStore.get('cloudflareApiKey');
      } catch (e) {}

      if (!cfAccountId || !cfApiToken) {
        throw createCloudflareUserError(CLOUDFLARE_INVALID_ACCOUNT_MESSAGE, 'CLOUDFLARE_INVALID_ACCOUNT');
      }

      // Use OpenAI-compatible endpoint for better tool calling support
      const url = `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/v1/chat/completions`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cfApiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
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
      
      if (isNativeOpenAI) {
        // Mock cfData.result to use our new parser
        cfData.result = cfData;
      }
      
      // Map Cloudflare's response to OpenAI format so the rest of the app works
      let textContent = '';
      let toolCalls = null;
      
      console.log(`[ModelGateway] cfData.result:`, JSON.stringify(cfData.result).slice(0, 500));

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
      
      // If the model output a tool call natively in the CF result format
      if (!toolCalls && cfData.result && cfData.result.tool_calls) {
        toolCalls = cfData.result.tool_calls;
      }

      const data = {
        choices: [
          {
            message: {
              content: textContent,
              ...(toolCalls ? { tool_calls: toolCalls } : {})
            }
          }
        ],
        usage: { total_tokens: 0 }
      };

      const tokens = 0;
      return { data, tokensUsed: tokens };

    } catch (cfError) {
      if (cfError.name === 'AbortError') {
        cfError = createCloudflareUserError('Cloudflare request timed out. Please try again.', 'CLOUDFLARE_TIMEOUT');
      }

      console.error(`[ModelGateway] Cloudflare failed: ${cfError.isCloudflareUserError ? cfError.message : CLOUDFLARE_GENERIC_MESSAGE}.`);

      if (cfError.code === 'CLOUDFLARE_INVALID_ACCOUNT' || cfError.code === 'ACTRA_AI_DAILY_LIMIT') {
        throw cfError;
      }
      
      const key = await this.getApiKey();
      if (!key || key === 'YOUR_GROQ_API_KEY') {
        throw cfError.isCloudflareUserError ? cfError : createCloudflareUserError(CLOUDFLARE_GENERIC_MESSAGE, 'CLOUDFLARE_REQUEST_FAILED');
      }
      
      console.log('Falling back to Groq...');
      let groqModel = payload.model;
      if (groqModel === '@cf/openai/gpt-oss-120b' || !this.availableModels || !this.availableModels.includes(groqModel)) {
        groqModel = await this.resolveModel(isReasoning ? this.reasoningModel : this.defaultModel, isReasoning);
      }
      
      const groqPayload = {
        ...payload,
        model: groqModel
      };

      return await this._fetchGroq(groqPayload);
    }
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
    return textModels.find(m => m.includes('llama')) || textModels.find(m => m.includes('gpt-oss-120b')) || textModels[0];
  }

  /**
   * Simple chat completion.
   */
  async chat(messages, options = {}) {
    const sysMsg = options.systemInstruction ? [{ role: 'system', content: options.systemInstruction }] : [];
    
    const payload = {
      model: options.model || '@cf/openai/gpt-oss-120b',
      messages: [...sysMsg, ...messages],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 1024,
    };

    const { data, tokensUsed } = await this._fetchWithFallback(payload, false);
    return { text: data.choices[0]?.message?.content || '', tokensUsed };
  }

  /**
   * Chat with function calling / tool use.
   */
  async toolCall(messages, tools, options = {}) {
    const sysMsg = options.systemInstruction ? [{ role: 'system', content: options.systemInstruction }] : [];

    const groqTools = tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters || { type: 'object', properties: {} }
      }
    }));

    const payload = {
      model: options.model || '@cf/openai/gpt-oss-120b',
      messages: [...sysMsg, ...messages],
      tools: groqTools,
      tool_choice: 'auto',
      temperature: options.temperature ?? 0.3,
    };

    const { data, tokensUsed } = await this._fetchWithFallback(payload, true);
    const message = data.choices[0]?.message;

    if (message?.tool_calls?.length > 0) {
      const toolCalls = message.tool_calls.map(tc => {
        let args = {};
        try {
          args = JSON.parse(tc.function.arguments);
        } catch(e) {}
        return { name: tc.function.name, args };
      });
      return { toolCalls, tokensUsed };
    }

    return { text: message?.content || '', tokensUsed };
  }

  /**
   * Get structured JSON output.
   */
  async structuredOutput(prompt, schema, options = {}) {
    // Groq requires JSON output instruction in the prompt
    const sysMsg = [{ 
      role: 'system', 
      content: `${options.systemInstruction || 'You are a helpful assistant.'}\nOutput your response ONLY in valid JSON matching this schema:\n${JSON.stringify(schema)}`
    }];

    const payload = {
      model: options.model || '@cf/openai/gpt-oss-120b',
      messages: [...sysMsg, { role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: options.temperature ?? 0.1,
    };

    const { data, tokensUsed } = await this._fetchWithFallback(payload, true);
    const text = data.choices[0]?.message?.content || '{}';
    let parsedData;
    
    if (typeof text !== 'string') {
      // Cloudflare sometimes auto-parses JSON responses natively.
      parsedData = text;
    } else {
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

  // Budget
  setTokenBudget(budget) { this.tokenBudget = budget; }
  getTokensUsed() { return this.totalTokensUsed; }
  resetTokenCounter() { this.totalTokensUsed = 0; }

  _checkBudget() {
    if (this.totalTokensUsed >= this.tokenBudget) {
      console.warn(`[ModelGateway] Token budget exceeded: ${this.totalTokensUsed}/${this.tokenBudget}`);
    }
  }
}

module.exports = ModelGateway;
