const fetch = require('node-fetch');

/**
 * UI-TARS 7B Engine
 * Orchestrates the continuous VLM loop for complex browser tasks.
 * OBSERVE -> REASON -> ACTION -> VERIFY
 */
class UITarsEngine {
  constructor(tabManager, browserInteraction) {
    this.tabManager = tabManager;
    this.browserInteraction = browserInteraction;
    // Default to the same Ollama instance used previously if not explicitly set
    this.endpoint = process.env.UI_TARS_ENDPOINT || 'http://100.107.81.110:11435/v1/chat/completions';
    this.apiKey = process.env.UI_TARS_API_KEY || 'dummy';
  }

  /**
   * Executes a high-level goal using UI-TARS VLM loop.
   */
  async executeGoal(goal, tabId, maxSteps = 15, onStepProgress = null) {
    let stepCount = 0;
    const history = [];

    while (stepCount < maxSteps) {
      stepCount++;
      if (onStepProgress) onStepProgress(`Step ${stepCount}: Observing screen...`);

      // 1. OBSERVE
      const screenshotBase64 = await this.tabManager.captureScreenshot(tabId);
      if (!screenshotBase64) {
        throw new Error('Failed to capture screenshot.');
      }

      // Prepare UI-TARS payload.
      const prompt = `Goal: ${goal}
Based on the screenshot, what is the next action?
Output strictly in JSON format with properties: "action" (click, type, scroll, done), "coordinate" ([x, y] for click/type), "text" (for type), "direction" (for scroll: up, down).`;

      // 2. REASON
      if (onStepProgress) onStepProgress(`Step ${stepCount}: Reasoning via UI-TARS...`);
      const actionData = await this._queryVLM(prompt, screenshotBase64, history);
      
      if (!actionData) {
        throw new Error('UI-TARS returned invalid or empty action.');
      }

      history.push({ step: stepCount, action: actionData });

      // 3. ACTION
      if (actionData.action === 'done') {
        if (onStepProgress) onStepProgress('Goal accomplished successfully!');
        return { success: true, history };
      }

      if (actionData.action === 'click') {
        const [x, y] = actionData.coordinate || [0, 0];
        if (onStepProgress) onStepProgress(`Clicking at [${x}, ${y}]`);
        await this.browserInteraction.clickAt(tabId, x, y);
      } else if (actionData.action === 'type') {
        const [x, y] = actionData.coordinate || [0, 0];
        const text = actionData.text || '';
        if (onStepProgress) onStepProgress(`Typing "${text}" at [${x}, ${y}]`);
        await this.browserInteraction.typeAt(tabId, x, y, text);
      } else if (actionData.action === 'scroll') {
        const dir = actionData.direction || 'down';
        const amount = dir === 'down' ? 500 : -500;
        if (onStepProgress) onStepProgress(`Scrolling ${dir}`);
        await this.browserInteraction.scrollPage(tabId, amount);
      } else {
        throw new Error(`Unknown action type: ${actionData.action}`);
      }

      // Wait for DOM to settle
      await new Promise(r => setTimeout(r, 2000));
    }

    throw new Error(`Goal not completed within maximum steps (${maxSteps})`);
  }

  async _queryVLM(prompt, screenshotBase64, history) {
    const base64Data = screenshotBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');

    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:image/png;base64,${base64Data}` } }
        ]
      }
    ];

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'ui-tars-7b',
          messages: messages,
          temperature: 0.1,
          response_format: { type: "json_object" }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`UI-TARS API Error ${response.status}: ${errText}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content || '{}';
      
      let parsed;
      try {
        parsed = JSON.parse(content.replace(/\`\`\`json/gi, '').replace(/\`\`\`/g, '').trim());
      } catch (e) {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
        else throw new Error("Could not parse UI-TARS JSON response: " + content);
      }
      return parsed;

    } catch (err) {
      console.error('[UITarsEngine] Error querying VLM:', err);
      return null;
    }
  }
}

module.exports = UITarsEngine;
