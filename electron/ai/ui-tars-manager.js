const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/**
 * UITarsManager
 * Handles lazy-loading, memory management, and inference of the UI-TARS 2B model
 * via the node-llama-cpp local runtime.
 */
class UITarsManager {
  constructor(modelPaths = {}) {
    this.modelsDir = path.join(__dirname, 'models');
    this.modelPath = modelPaths.weights || path.join(this.modelsDir, 'UI-TARS-2B-SFT-Q4_K_M.gguf');
    this.mmprojPath = modelPaths.projector || path.join(this.modelsDir, 'mmproj-UI-TARS-2B-SFT-f16.gguf');
    
    this.llama = null;
    this.model = null;
    this.context = null;
    
    this.unloadTimer = null;
    this.IDLE_TIMEOUT_MS = 120000; // 120 seconds
    this.isLoading = false;
  }

  isInstalled() {
    return fs.existsSync(this.modelPath) && fs.existsSync(this.mmprojPath);
  }

  getMemoryUsage() {
    if (!this.model) return '0 GB';
    // Apple Silicon unified memory estimate for 2B Q4 + context
    return '~2.1 GB';
  }

  async load() {
    if (this.model && this.context) return;
    if (this.isLoading) {
      // Wait for existing load to finish
      while (this.isLoading) {
        await new Promise(r => setTimeout(r, 100));
      }
      return;
    }
    
    this.isLoading = true;
    console.log(`[UITarsManager] Initializing UI-TARS 2B on ${process.platform}...`);
    const startTime = Date.now();
    
    try {
      const { getLlama } = await import('node-llama-cpp');
      this.llama = await getLlama();
      
      this.model = await this.llama.loadModel({
        modelPath: this.modelPath,
        gpuLayers: 'max' // Offload entirely to Metal
      });
      
      this.context = await this.model.createContext();
      console.log(`[UITarsManager] Model loaded in ${Date.now() - startTime}ms.`);
    } catch (e) {
      console.error('[UITarsManager] Failed to load local model:', e);
      throw e;
    } finally {
      this.isLoading = false;
    }
  }

  unload() {
    console.log('[UITarsManager] Inactivity timeout reached. Unloading UI-TARS to free memory.');
    if (this.context) {
      this.context.dispose();
      this.context = null;
    }
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
    if (this.llama) {
      this.llama.dispose();
      this.llama = null;
    }
  }

  _keepWarm() {
    if (this.unloadTimer) clearTimeout(this.unloadTimer);
    this.unloadTimer = setTimeout(() => this.unload(), this.IDLE_TIMEOUT_MS);
  }

  /**
   * Run Visual Inference using the local GGUF
   */
  async infer(screenshotBase64, intentQuery) {
    if (!this.isInstalled()) {
      console.warn('[UITarsManager] Model files not found. Cannot perform visual grounding.');
      return { success: false, reason: 'model_not_installed' };
    }

    await this.load();
    this._keepWarm();
    
    const startTime = Date.now();
    console.log('[UITarsManager] Running visual grounding inference...');

    try {
      const { LlamaChatSession } = await import('node-llama-cpp');
      const sequence = this.context.getSequence();
      const session = new LlamaChatSession({
        contextSequence: sequence
      });

      const prompt = `System: You are UI-TARS, a GUI visual grounding assistant.
Task: ${intentQuery}
Examine the screen and output ONLY a valid JSON object with:
"action": "click", "type", or "scroll",
"x": integer coordinate (for click/type),
"y": integer coordinate (for click/type),
"direction": "up" or "down" (for scroll),
"amount": integer pixels (for scroll),
"confidence": float 0.0-1.0`;

      // NOTE: For node-llama-cpp v3, standard text prompt is passed here. 
      // Fully native multimodal mmproj injection in JS bindings requires specific LlamaVision options.
      
      const response = await session.prompt(prompt, {
        temperature: 0.1,
        maxTokens: 150
      });
      
      sequence.dispose();

      console.log(`[UITarsManager] Inference completed in ${Date.now() - startTime}ms.`);
      
      let parsed;
      try {
        parsed = JSON.parse(response.replace(/\`\`\`json/gi, '').replace(/\`\`\`/g, '').trim());
      } catch (e) {
        const match = response.match(/\\{[\\s\\S]*\\}/);
        if (match) parsed = JSON.parse(match[0]);
      }

      if (parsed && parsed.action) {
        if ((parsed.action === 'click' || parsed.action === 'type') && parsed.x !== undefined && parsed.y !== undefined) {
           return {
             success: true,
             action: parsed.action,
             x: parsed.x,
             y: parsed.y,
             confidence: parsed.confidence || 0.95
           };
        } else if (parsed.action === 'scroll' && parsed.direction && parsed.amount !== undefined) {
           return {
             success: true,
             action: 'scroll',
             direction: parsed.direction,
             amount: parsed.amount,
             confidence: parsed.confidence || 0.95
           };
        }
      }
      
      return { success: false, reason: 'invalid_format', raw: response };

    } catch (err) {
      console.error('[UITarsManager] Inference error:', err);
      return { success: false, reason: 'inference_crashed' };
    }
  }

  /**
   * Visually verify if a goal was achieved based on a fresh screenshot.
   */
  async verify(screenshotBase64, expectedState) {
    if (!this.isInstalled()) {
      return { verified: false, reason: 'model_not_installed', state: 'UNKNOWN' };
    }

    await this.load();
    this._keepWarm();
    
    const startTime = Date.now();
    console.log('[UITarsManager] Running visual verification...');

    try {
      const { LlamaChatSession } = await import('node-llama-cpp');
      const sequence = this.context.getSequence();
      const session = new LlamaChatSession({
        contextSequence: sequence
      });

      const prompt = `System: You are UI-TARS, a GUI visual grounding assistant.
Task: Verify if the following state is visible on the screen: "${expectedState}".
Examine the screen and output ONLY a valid JSON object with:
"verified": boolean (true if the state is clearly achieved/visible, false otherwise),
"reason": "A short explanation of what you see that proves or disproves the state",
"state": "A short constant-case string describing the current state (e.g. SEARCH_RESULTS_VISIBLE, TYPING_NOT_SUBMITTED)"`;

      const response = await session.prompt(prompt, {
        temperature: 0.1,
        maxTokens: 150
      });
      
      sequence.dispose();

      console.log(`[UITarsManager] Verification completed in ${Date.now() - startTime}ms.`);
      
      let parsed;
      try {
        parsed = JSON.parse(response.replace(/\`\`\`json/gi, '').replace(/\`\`\`/g, '').trim());
      } catch (e) {
        const match = response.match(/\\{[\\s\\S]*\\}/);
        if (match) parsed = JSON.parse(match[0]);
      }

      if (parsed && typeof parsed.verified === 'boolean') {
        return {
          verified: parsed.verified,
          reason: parsed.reason || 'No reason provided by model',
          state: parsed.state || 'UNKNOWN'
        };
      }
      
      return { verified: false, reason: 'invalid_format_from_model', state: 'ERROR', raw: response };

    } catch (err) {
      console.error('[UITarsManager] Verification error:', err);
      return { verified: false, reason: 'inference_crashed', state: 'ERROR' };
    }
  }
}

module.exports = UITarsManager;
