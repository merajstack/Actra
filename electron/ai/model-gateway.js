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

class ModelGateway {
  constructor() {
    this.apiKey = process.env.GROQ_API_KEY;
    this.defaultModel = 'llama-3.1-8b-instant'; // fast default
    this.reasoningModel = 'llama-3.1-70b-versatile'; // powerful model
    this.baseUrl = 'https://api.groq.com/openai/v1/chat/completions';
    this.modelsUrl = 'https://api.groq.com/openai/v1/models';
    
    this.totalTokensUsed = 0;
    this.tokenBudget = Infinity;

    this.availableModels = null;
    this.fetchingModels = null;

    if (!this.apiKey || this.apiKey === 'YOUR_GROQ_API_KEY') {
      console.warn('[ModelGateway] No GROQ_API_KEY found. AI features will fail.');
    }
  }

  isAvailable() {
    return !!this.apiKey && this.apiKey !== 'YOUR_GROQ_API_KEY';
  }

  async _fetchGroq(payload) {
    if (!this.isAvailable()) {
      throw new Error('Groq API Key is not configured. Please set GROQ_API_KEY in .env');
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
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

  async _ensureModels() {
    if (!this.isAvailable()) return;
    if (this.availableModels) return;
    if (this.fetchingModels) return this.fetchingModels;
    
    this.fetchingModels = (async () => {
      try {
        const response = await fetch(this.modelsUrl, {
          headers: { 'Authorization': `Bearer ${this.apiKey}` }
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
    if (!this.availableModels || this.availableModels.length === 0) return requestedModel;
    
    if (this.availableModels.includes(requestedModel)) return requestedModel;
    
    // Filter out audio/vision/guard models
    const textModels = this.availableModels.filter(m => 
      !m.includes('whisper') && !m.includes('vision') && !m.includes('audio') && !m.includes('guard') && !m.includes('speech') && !m.includes('embedding')
    );

    if (textModels.length === 0) return requestedModel;

    // For reasoning tasks, try to find a large model
    if (isReasoning) {
       const large = textModels.find(m => m.includes('70b') || m.includes('120b') || m.includes('90b') || m.includes('27b') || m.includes('compound'));
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
    let model = options.model || this.defaultModel;
    if (model.includes('gemini')) model = this.defaultModel;
    model = await this.resolveModel(model, false);
    const sysMsg = options.systemInstruction ? [{ role: 'system', content: options.systemInstruction }] : [];
    
    const payload = {
      model,
      messages: [...sysMsg, ...messages],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 1024,
    };

    const { data, tokensUsed } = await this._fetchGroq(payload);
    return { text: data.choices[0]?.message?.content || '', tokensUsed };
  }

  /**
   * Chat with function calling / tool use.
   */
  async toolCall(messages, tools, options = {}) {
    let model = options.model || this.reasoningModel;
    if (model.includes('gemini')) model = this.reasoningModel;
    model = await this.resolveModel(model, true);
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
      model,
      messages: [...sysMsg, ...messages],
      tools: groqTools,
      tool_choice: 'auto',
      temperature: options.temperature ?? 0.3,
    };

    const { data, tokensUsed } = await this._fetchGroq(payload);
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
    let model = options.model || this.reasoningModel;
    if (model.includes('gemini')) model = this.reasoningModel;
    model = await this.resolveModel(model, true);
    
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

    const { data, tokensUsed } = await this._fetchGroq(payload);
    const text = data.choices[0]?.message?.content || '{}';
    
    let parsedData;
    try {
      parsedData = JSON.parse(text);
    } catch {
      parsedData = { raw: text };
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
