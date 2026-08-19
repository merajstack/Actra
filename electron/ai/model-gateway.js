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
      const localKey = new Store({ name: 'config' }).get('groqKey');
      if (localKey) return localKey;
    } catch (e) {}
    try {
      const { data } = await supabase.from('settings').select('value').eq('key', 'groqKey').single();
      if (data?.value) return data.value;
    } catch (e) {}
    return process.env.GROQ_API_KEY;
  }

  isAvailable() {
    return true; // Cloudflare Qwen 30B is always available as first priority
  }

  async _fetchGroq(payload) {
    const key = await this.getApiKey();
    if (!key || key === 'YOUR_GROQ_API_KEY') {
      throw new Error('Groq API Key is not configured. Please set GROQ_API_KEY in .env or via onboarding.');
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const payloadStr = JSON.stringify(payload);
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

  async _fetchWithFallback(payload, isReasoning = false) {
    try {
      console.log(`[ModelGateway] Attempting Cloudflare AI: qwen3-30b`);
      
      let cfAccountId;
      let cfApiToken;

      try {
        const { default: Store } = await import('electron-store');
        const localStore = new Store({ name: 'config' });
        cfAccountId = localStore.get('cloudflareAccountId');
        cfApiToken = localStore.get('cloudflareApiKey');
      } catch (e) {}

      if (!cfAccountId || !cfApiToken) {
        throw new Error('Cloudflare credentials are not configured. Add the account ID and API token in Settings.');
      }

      // Filter payload for Cloudflare /ai/run/ endpoint
      const { model, ...restPayload } = payload;
      
      const url = `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/run/@cf/qwen/qwen3-30b-a3b-fp8`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cfApiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(restPayload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cloudflare HTTP Error: ${response.status} - ${errorText}`);
      }

      const cfData = await response.json();
      
      if (!cfData.success) {
        throw new Error(`Cloudflare AI Error: ${JSON.stringify(cfData.errors)}`);
      }

      console.log(`[ModelGateway] Cloudflare request succeeded!`);
      
      // Map Cloudflare's response to OpenAI format so the rest of the app works
      let textContent = '';
      let toolCalls = null;
      
      if (cfData.result && cfData.result.response) {
        textContent = cfData.result.response;
      }
      
      // If the model output a tool call natively in the CF result format
      if (cfData.result && cfData.result.tool_calls) {
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
      console.error(`[ModelGateway] Cloudflare failed: ${cfError.message}.`);
      
      const key = await this.getApiKey();
      if (!key || key === 'YOUR_GROQ_API_KEY') {
        throw new Error(`Cloudflare Request Failed: ${cfError.message}`);
      }
      
      console.log('Falling back to Groq...');
      let groqModel = payload.model;
      if (groqModel === 'qwen3-30b-a3b-fp8' || groqModel === 'qwen3:8b-q4_K_M' || !this.availableModels || !this.availableModels.includes(groqModel)) {
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
    return textModels.find(m => m.includes('llama')) || textModels.find(m => m.includes('qwen')) || textModels[0];
  }

  /**
   * Simple chat completion.
   */
  async chat(messages, options = {}) {
    const sysMsg = options.systemInstruction ? [{ role: 'system', content: options.systemInstruction }] : [];
    
    const payload = {
      model: options.model || 'qwen3-30b-a3b-fp8',
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
      model: options.model || 'qwen3-30b-a3b-fp8',
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
      model: options.model || 'qwen3-30b-a3b-fp8',
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
