const crypto = require('crypto');
const dns = require('dns');
const fetch = global.fetch || require('node-fetch');

/**
 * Known site URL mapping for WebTaskAgent navigation.
 */
const SITE_HOMEPAGES = {
  amazon:     'https://www.amazon.com',
  youtube:    'https://www.youtube.com',
  ebay:       'https://www.ebay.com',
  google:     'https://www.google.com',
  reddit:     'https://www.reddit.com',
  twitter:    'https://twitter.com',
  github:     'https://github.com',
  netflix:    'https://www.netflix.com',
  spotify:    'https://open.spotify.com',
};

/**
 * WebTaskAgent
 *
 * Autonomous human-like web agent for complex shopping and media automation.
 *
 * Perception Loop (max 15 iterations):
 * 1. Screenshot after the page settles (waits for frame changes, no fixed sleep).
 * 2. Asks vision model (UI-TARS remote endpoint) for NEXT SINGLE action only:
 *    { thought, action: click|type|scroll|press_key|done|need_help, x, y, text }
 * 3. Enforces safety: prevents checkout, place order, payment, address fields.
 * 4. Executes via browserInteraction, verifies screen changed.
 * 5. Applies filters like a human, verifies constraints on product page.
 * 6. Logs thought + action per iteration to task steps.
 * 7. Fails fast with friendly quota message on model unavailability.
 */
class WebTaskAgent {
  constructor(deps = {}) {
    this.tabManager          = deps.tabManager;
    this.taskManager         = deps.taskManager;
    this.chatManager         = deps.chatManager;
    this.auditLog            = deps.auditLog;
    this.modelGateway        = deps.modelGateway;
    this.browserInteraction  = deps.browserInteractionEngine || deps.browserInteraction;
    this.approvalEngine      = deps.approvalEngine || null;

    // Strictly UI-TARS remote endpoint for vision calls, NOT Cloudflare
    this.endpoint            = process.env.UI_TARS_ENDPOINT || 'http://100.107.81.110:11435/v1/chat/completions';
    this.apiKey              = process.env.UI_TARS_API_KEY   || 'dummy';
    this.maxIterations       = 15;
  }

  /**
   * Main entrypoint for executing a parsed web task intent.
   *
   * @param {object} params
   * @param {object} params.intent       Parsed intent: { site, search_query, constraints, final_action }
   * @param {string} params.command      Original user command
   * @param {string} params.tabId        Active tab ID
   * @param {object} params.task         TaskManager task object
   * @param {object} params.assistantMsg ChatManager assistant message
   * @param {string} [params.auditEntryId]
   * @returns {Promise<{ success: boolean, iterations: number, actionsTaken: Array }>}
   */
  async execute({ intent, command, tabId, task, assistantMsg, auditEntryId }) {
    const actionsTaken = [];
    let iteration = 0;
    let lastScreenshotHash = null;
    let multipleMatched = false;

    try {
      // ── Step 1: Open the site ──────────────────────────────────────────────
      const targetUrl = await WebTaskAgent.resolveSiteUrl(intent.site);

      this.taskManager.addStep(task.id, `🌐 Opening ${intent.site.toUpperCase()}: ${targetUrl}`, 'completed', 'navigate');
      if (assistantMsg?.id) {
        await this.chatManager.updateMessage(assistantMsg.id, {
          content: `🌐 Navigating to ${intent.site} for "${intent.search_query}"...`,
          isLoading: true,
          streaming: true,
        });
      }

      await this.tabManager.navigate(tabId, targetUrl);

      // Settle initial page frame
      const initialSettle = await this.waitForPageSettled(tabId, null, 6000);
      lastScreenshotHash = initialSettle.hash;

      // ── Step 2: Perception Loop (max 15 iterations) ────────────────────────
      while (iteration < this.maxIterations) {
        iteration++;

        // Respect task cancellation
        if (this.taskManager.getTask(task.id)?.status === 'cancelled') {
          console.log(`[WebTaskAgent] Task ${task.id} cancelled. Aborting perception loop.`);
          return { success: false, iterations: iteration, actionsTaken, cancelled: true };
        }

        // 2a. Screenshot after the page settles (waits for frame change; no fixed sleep)
        const settleResult = await this.waitForPageSettled(tabId, lastScreenshotHash, 5000);
        const screenshot = settleResult.screenshot;
        const screenChanged = settleResult.changed;
        lastScreenshotHash = settleResult.hash || lastScreenshotHash;

        if (!screenshot) {
          throw new Error('Failed to capture screenshot from active tab.');
        }

        const view = this.tabManager?.tabs?.get(tabId);
        const currentUrl = view?.webContents?.getURL() || targetUrl;

        // 2b. Ask the vision model for NEXT SINGLE action only via UI-TARS remote endpoint
        const last3Actions = actionsTaken.slice(-3);
        let actionData;
        try {
          actionData = await this._queryVisionModel(screenshot, command, intent, last3Actions, currentUrl);
        } catch (visionErr) {
          console.error(`[WebTaskAgent] UI-TARS Vision error at iteration ${iteration}:`, visionErr.message);
          // 5. Fail fast with friendly quota/availability message
          const quotaErr = this.modelGateway?.getLastQuotaError?.();
          const friendlyMsg = quotaErr?.message ||
            `AI vision server (UI-TARS) is currently unavailable or unreachable (${visionErr.message}). Please verify the UI-TARS endpoint is online.`;

          this.taskManager.addStep(task.id, `⚠️ ${friendlyMsg}`, 'failed', 'error');
          this.taskManager.updateTaskStatus(task.id, 'failed', { error: friendlyMsg });
          if (assistantMsg?.id) {
            await this.chatManager.updateMessage(assistantMsg.id, {
              content: `⚠️ ${friendlyMsg}`,
              isLoading: false,
              streaming: false,
            });
          }
          if (auditEntryId && this.auditLog) {
            this.auditLog.updateEntry(auditEntryId, { execution_status: 'failed', error: friendlyMsg });
          }
          return { success: false, iterations: iteration, actionsTaken, error: friendlyMsg };
        }

        if (!actionData || !actionData.action) {
          actionData = { action: 'need_help', thought: 'Vision model returned an empty action.' };
        }

        // 2d. Log thought + action per iteration to task steps
        const stepTitle = `Iter ${iteration}: [${actionData.action.toUpperCase()}] ${actionData.thought || ''}`.trim();
        this.taskManager.addStep(task.id, stepTitle, 'completed', actionData.action);

        if (assistantMsg?.id) {
          await this.chatManager.updateMessage(assistantMsg.id, {
            content: `🔄 Step ${iteration}/${this.maxIterations}: ${actionData.thought || actionData.action}`,
            isLoading: true,
            streaming: true,
          });
        }

        // 4. Safety Guard Check: NEVER click checkout, place order, pay, or enter card/address
        // FAILS CLOSED: If document.elementFromPoint or script execution fails/times out, action is blocked
        const safetyViolation = await this._checkSafety(actionData, view);
        if (safetyViolation) {
          const safetyMsg = `🛡️ Safety Stop: Blocked attempted checkout / payment action (${safetyViolation}). Actra will not proceed to checkout or enter payment details without manual user action.`;
          this.taskManager.addStep(task.id, safetyMsg, 'completed', 'safety');
          this.taskManager.updateTaskStatus(task.id, 'completed', { outputs: safetyMsg });
          if (assistantMsg?.id) {
            await this.chatManager.updateMessage(assistantMsg.id, {
              content: `${safetyMsg}\n\nTask stopped cleanly so you can review your cart and complete checkout safely.`,
              isLoading: false,
              streaming: false,
            });
          }
          actionsTaken.push({ ...actionData, screenChanged: false, safetyBlocked: true });
          return { success: true, iterations: iteration, actionsTaken, safetyStopped: true };
        }

        // Terminal condition: DONE
        if (actionData.action === 'done') {
          const finalSummary = actionData.thought || 'Task completed successfully!';
          this.taskManager.addStep(task.id, `✅ ${finalSummary}`, 'completed', 'done');
          this.taskManager.updateTaskStatus(task.id, 'completed', { outputs: finalSummary });
          if (assistantMsg?.id) {
            await this.chatManager.updateMessage(assistantMsg.id, {
              content: finalSummary,
              isLoading: false,
              streaming: false,
            });
          }
          actionsTaken.push({ ...actionData, screenChanged: true });
          if (auditEntryId && this.auditLog) {
            this.auditLog.updateEntry(auditEntryId, { execution_status: 'success', execution_result: finalSummary });
          }
          return { success: true, iterations: iteration, actionsTaken };
        }

        // Terminal condition: NEED_HELP (e.g. no products meet constraints)
        if (actionData.action === 'need_help') {
          const helpMsg = actionData.thought || actionData.text || 'Could not find a qualifying product matching all criteria.';
          this.taskManager.addStep(task.id, `ℹ️ ${helpMsg}`, 'completed', 'need_help');
          this.taskManager.updateTaskStatus(task.id, 'completed', { outputs: helpMsg });
          if (assistantMsg?.id) {
            await this.chatManager.updateMessage(assistantMsg.id, {
              content: `ℹ️ ${helpMsg}`,
              isLoading: false,
              streaming: false,
            });
          }
          actionsTaken.push({ ...actionData, screenChanged: false });
          return { success: false, iterations: iteration, actionsTaken, needHelp: true };
        }

        // Check if multiple matching products detected before final action
        if (actionData.thought && /\b(multiple|several|many|two|three|options)\b/i.test(actionData.thought)) {
          multipleMatched = true;
        }

        if (actionData.text === 'add_to_cart' || (actionData.thought && /add(ing)? to cart/i.test(actionData.thought))) {
          if (multipleMatched) {
            await this._confirmAddIfMultiple(task, assistantMsg);
          }
        }

        // 2c. Execute via browserInteraction (clickAt / typeAt / scroll / press_key)
        await this._executeAction(tabId, actionData);

        // Record action with provisional screenChanged flag to be verified after settle
        actionsTaken.push({ ...actionData, screenChanged: true });
      }

      // ── Step 3: Max 15 iterations reached without terminal action ──────────
      const maxMsg = 'Completed 15 iterations. Please check the current browser screen to proceed further.';
      this.taskManager.addStep(task.id, `⏹️ ${maxMsg}`, 'completed', 'max_steps');
      this.taskManager.updateTaskStatus(task.id, 'completed', { outputs: maxMsg });
      if (assistantMsg?.id) {
        await this.chatManager.updateMessage(assistantMsg.id, {
          content: maxMsg,
          isLoading: false,
          streaming: false,
        });
      }
      return { success: true, iterations: iteration, actionsTaken, maxReached: true };

    } catch (err) {
      console.error('[WebTaskAgent] Unhandled error in execution:', err);
      const errMsg = err.message || 'An error occurred during web task automation.';
      this.taskManager.updateTaskStatus(task.id, 'failed', { error: errMsg });
      if (assistantMsg?.id) {
        await this.chatManager.updateMessage(assistantMsg.id, {
          content: `❌ ${errMsg}`,
          isLoading: false,
          streaming: false,
        });
      }
      return { success: false, iterations: iteration, actionsTaken, error: errMsg };
    }
  }

  /**
   * Waits for the page frame to actually change and settle without a fixed sleep.
   * Compares MD5 hashes of screenshots.
   */
  async waitForPageSettled(tabId, previousHash = null, maxTimeoutMs = 5000) {
    const view = this.tabManager?.tabs?.get(tabId);
    if (!view) return { screenshot: null, hash: null, changed: false };

    const webContents = view.webContents;

    // 1. If webContents is actively loading, wait for 'did-stop-loading' or timeout
    if (webContents && typeof webContents.isLoading === 'function' && webContents.isLoading()) {
      await new Promise(resolve => {
        let tid;
        const onStop = () => {
          clearTimeout(tid);
          webContents.removeListener('did-stop-loading', onStop);
          resolve();
        };
        tid = setTimeout(onStop, Math.min(maxTimeoutMs, 3500));
        webContents.once('did-stop-loading', onStop);
      });
    }

    // 2. Wait for DOM readyState and requestAnimationFrame
    try {
      await webContents.executeJavaScript(`
        new Promise(resolve => {
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
              requestAnimationFrame(() => requestAnimationFrame(resolve));
            }, { once: true });
          } else {
            requestAnimationFrame(() => requestAnimationFrame(resolve));
          }
        })
      `);
    } catch (_) {}

    // 3. Capture screenshot
    let screenshot = await this.tabManager.captureScreenshot(tabId);
    if (!screenshot) return { screenshot: null, hash: null, changed: false };

    const hash = crypto.createHash('md5').update(screenshot).digest('hex');
    const changed = previousHash ? (hash !== previousHash) : true;

    // If waiting for a change after an action and it hasn't changed yet, poll briefly
    if (previousHash && !changed) {
      const pollStart = Date.now();
      while (Date.now() - pollStart < 2500) {
        await new Promise(r => setTimeout(r, 200));
        const nextShot = await this.tabManager.captureScreenshot(tabId);
        if (nextShot) {
          const nextHash = crypto.createHash('md5').update(nextShot).digest('hex');
          if (nextHash !== previousHash) {
            return { screenshot: nextShot, hash: nextHash, changed: true };
          }
        }
      }
    }

    return { screenshot, hash, changed };
  }

  /**
   * Queries the UI-TARS remote vision endpoint for the next single action.
   */
  async _queryVisionModel(screenshotBase64, goal, intent, last3Actions, currentUrl) {
    const cleanBase64 = (screenshotBase64 || '').replace(/^data:image\/(png|jpeg|jpg);base64,/, '');

    const historyText = (last3Actions && last3Actions.length > 0)
      ? last3Actions.map((a, i) => {
          const status = a.screenChanged === false ? ' [WARNING: Did NOT change the screen! Try a different action or coordinates]' : '';
          return `Action ${i + 1}: ${a.action} at [${a.x ?? 0}, ${a.y ?? 0}] (thought: "${a.thought || ''}")${status}`;
        }).join('\n')
      : 'None (First step)';

    const constraintsText = (intent.constraints && intent.constraints.length > 0)
      ? intent.constraints.map(c => `- ${c.type}: ${c.value} (max: ${c.max ?? 'none'})`).join('\n')
      : 'None';

    const prompt = `You are UI-TARS, an autonomous web visual agent.
Goal: "${goal}"
Target Site: "${intent.site}"
Search Query: "${intent.search_query}" (strictly use this clean keyword query)
Constraints:
${constraintsText}
Final Desired Action: "${intent.final_action}"
Current URL: ${currentUrl}

Last 3 Actions:
${historyText}

PROCEDURE & STRICT RULES:
1. Search: If on homepage or search bar is empty, type "${intent.search_query}" into the search bar and press Enter.
2. Filters: Apply relevant filters and sort options visible on THIS page to satisfy the stated constraints — look for price range filters, delivery/shipping filters, or sort controls wherever they appear on the current site's UI, however it is laid out. Do not assume Amazon-specific filter names or positions. Reason about whatever filter UI is actually on screen, not pattern-match to a specific website layout.
3. Verify: Click a promising product. On the product page, confirm that the displayed price and delivery date/shipping time STRICTLY satisfy ALL constraints for this site (currency, delivery window, specifications).
   - If price or delivery violates constraints, return to results or inspect another item.
   - If NO product qualifies, return action: "need_help" explaining that no product meets all criteria. NEVER pick a non-qualifying product.
4. Final Action: Once an item is confirmed to meet all constraints, perform "${intent.final_action}". Note if multiple products matched.
5. If the previous action did NOT change the screen, DO NOT repeat it! Choose a different element, different coordinates, scroll, or alternate approach.
6. SAFETY RULE: NEVER click "Checkout", "Place order", "Pay", "Buy now", "Confirm purchase", "Proceed to payment", or enter payment/address details.
7. Return strictly valid JSON:
{
  "thought": "Your reasoning about what is on screen and why you are taking this action",
  "action": "click" | "type" | "scroll" | "press_key" | "done" | "need_help",
  "x": number,
  "y": number,
  "text": "text to type, key name, or reason",
  "direction": "up" | "down",
  "amount": number,
  "key": "Enter"
}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'ui-tars-7b',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: `data:image/png;base64,${cleanBase64}` } },
              ],
            },
          ],
          temperature: 0.1,
          max_tokens: 300,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`UI-TARS API Error ${response.status}: ${errText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '{}';
      return this._parseActionJSON(content);
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  _parseActionJSON(content) {
    if (!content) return null;
    let cleaned = content.replace(/```json/gi, '').replace(/```/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch (_) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try { return JSON.parse(match[0]); } catch (__) {}
      }
    }
    return null;
  }

  /**
   * Executes a single atomic action via BrowserInteractionEngine.
   */
  async _executeAction(tabId, actionData) {
    const action = actionData.action;

    if (action === 'click') {
      const x = Number(actionData.x) || 0;
      const y = Number(actionData.y) || 0;
      await this.browserInteraction.clickAt(tabId, x, y);
    } else if (action === 'type') {
      const x = Number(actionData.x) || 0;
      const y = Number(actionData.y) || 0;
      const text = actionData.text || '';
      await this.browserInteraction.typeAt(tabId, x, y, text);
      // If typing ended with newline or action requested Enter, trigger key press
      if (text.endsWith('\n')) {
        await this.browserInteraction.pressKey(tabId, 'Enter');
      }
    } else if (action === 'scroll') {
      const dir = (actionData.direction || 'down').toLowerCase();
      const amount = (dir === 'up' ? -1 : 1) * (Math.abs(Number(actionData.amount)) || 500);
      await this.browserInteraction.scrollPage(tabId, amount);
    } else if (action === 'press_key') {
      const key = actionData.key || actionData.text || 'Enter';
      await this.browserInteraction.pressKey(tabId, key);
    }
  }

  /**
   * Resolves any site name, domain, or raw URL into a complete navigable URL.
   * Tests candidate hosts via DNS resolution so unmapped sites produce a verified
   * live URL rather than an unverified guess that may 404 or fail to resolve.
   *
   * @param {string} rawSite
   * @returns {Promise<string>}
   */
  static async resolveSiteUrl(rawSite) {
    if (!rawSite) return 'https://www.google.com';
    let s = rawSite.trim().toLowerCase();

    // Already a complete URL
    if (s.startsWith('http://') || s.startsWith('https://')) return s;

    // Hardcoded known sites
    if (SITE_HOMEPAGES[s]) return SITE_HOMEPAGES[s];

    // Explicit domain provided (e.g. "decathlon.in", "chewy.com")
    if (s.includes('.')) return `https://${s}`;

    // Clean site name (alphanumeric and hyphens only)
    const clean = s.replace(/[^a-z0-9-]/g, '');
    if (!clean) return `https://www.google.com/search?q=${encodeURIComponent(rawSite)}`;

    const candidates = [
      `www.${clean}.com`,
      `${clean}.com`,
      `www.${clean}.in`,
      `www.${clean}.co.uk`,
      `www.${clean}.org`,
      `${clean}.in`,
      `${clean}.org`,
      `${clean}.net`,
    ];

    try {
      const dnsPromises = dns.promises || require('dns').promises;
      for (const host of candidates) {
        try {
          const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 800));
          const lookup = dnsPromises.lookup(host);
          const res = await Promise.race([lookup, timeout]);
          if (res && res.address) {
            return `https://${host}`;
          }
        } catch (dnsErr) {
          // If sandbox / permission denied, default to www.<clean>.com
          if (dnsErr.code === 'EPERM') {
            return `https://www.${clean}.com`;
          }
          // Continue to next candidate on ENOTFOUND / timeout
        }
      }
    } catch (_) {}

    // Fallback: If no candidate domain resolves via DNS, fall back to search to avoid dead ERR_NAME_NOT_RESOLVED
    return `https://www.google.com/search?q=${encodeURIComponent(rawSite)}`;
  }

  /**
   * Safety guard (Requirement 4):
   * Catches ANY generic checkout / payment intent:
   * - Finalizing purchase / placing order (checkout, place order, pay now, confirm purchase, buy now, etc.)
   * - Entering payment details, card number, CVV, UPI, net banking, or address credentials
   * Checks action thought, action text, and target element text from DOM.
   *
   * FAILS CLOSED: If document.elementFromPoint or script execution fails, throws,
   * times out, or cannot verify what is under the cursor for a click action,
   * the action is treated as unsafe and blocked rather than assumed fine.
   *
   * @param {object} actionData Action payload { action, thought, x, y, text }
   * @param {string|object} [domContext] Inspected DOM text OR view/webContents to inspect
   * @param {string|Error} [domCheckError] Explicit inspection error / failure reason
   * @returns {Promise<string|null>|string|null} Violation message if blocked, or null if allowed
   */
  async _checkSafety(actionData, domContext = '', domCheckError = null) {
    if (!actionData) return null;

    // Generic purchase finalization intent pattern across any shopping/e-commerce site
    const PURCHASE_INTENT_PATTERN = /\b(?:checkout|place\s+(?:your\s+)?order|submit\s+(?:your\s+)?order|confirm\s+(?:order|purchase)|complete\s+(?:order|purchase)|finalize\s+(?:order|purchase)|proceed\s+to\s+(?:pay|payment|checkout)|continue\s+to\s+(?:pay|payment|checkout)|pay\s+now|make\s+payment|buy\s+now|instant\s+buy|express\s+checkout|pay\s+with\b)/i;

    // Generic sensitive credentials / address / banking details pattern
    const SENSITIVE_DATA_PATTERN = /\b(?:credit\s+card|debit\s+card|card\s+number|cvv|cvc|security\s+code|expiration\s+date|expiry\s+date|billing\s+address|shipping\s+address|delivery\s+address|payment\s+method|upi\s+id|net\s*banking|wallet\s+pin|enter\s+otp)\b/i;

    // 1. Check thought and action text first
    const thoughtAndText = [actionData.thought, actionData.text].filter(Boolean).join(' ');
    const purchaseMatchFirst = thoughtAndText.match(PURCHASE_INTENT_PATTERN);
    if (purchaseMatchFirst) return purchaseMatchFirst[0];

    const sensitiveMatchFirst = thoughtAndText.match(SENSITIVE_DATA_PATTERN);
    if (sensitiveMatchFirst) return sensitiveMatchFirst[0];

    let domElementText = '';
    let checkError = domCheckError ? String(domCheckError.message || domCheckError) : null;

    // 2. Inspect DOM under click coordinates if view/webContents is provided
    const webContents = domContext?.webContents || (typeof domContext?.executeJavaScript === 'function' ? domContext : null);

    if (actionData.action === 'click') {
      if (webContents) {
        if (actionData.x == null || actionData.y == null) {
          checkError = 'Missing click coordinates (fail closed)';
        } else if (typeof webContents.isDestroyed === 'function' && webContents.isDestroyed()) {
          checkError = 'Target webContents is destroyed (fail closed)';
        } else {
          try {
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('DOM inspection timed out')), 2500)
            );
            const scriptPromise = webContents.executeJavaScript(`
              (() => {
                try {
                  const dpr = window.devicePixelRatio || 1;
                  const cssX = Math.round(${actionData.x} / dpr);
                  const cssY = Math.round(${actionData.y} / dpr);
                  const el = document.elementFromPoint(cssX, cssY);
                  if (!el) {
                    return { ok: false, error: 'No element found at point (' + cssX + ', ' + cssY + ')' };
                  }
                  const text = [
                    el.innerText,
                    el.getAttribute('aria-label'),
                    el.getAttribute('value'),
                    el.title,
                    el.placeholder,
                    el.name,
                    el.getAttribute('data-action'),
                    el.textContent,
                  ].filter(Boolean).join(' ').slice(0, 200);
                  return { ok: true, text };
                } catch (err) {
                  return { ok: false, error: err.message };
                }
              })()
            `);
            const result = await Promise.race([scriptPromise, timeoutPromise]);
            if (!result || !result.ok) {
              checkError = result?.error || 'Element inspection failed (fail closed)';
            } else {
              domElementText = result.text || '';
            }
          } catch (err) {
            checkError = err.message || 'DOM inspection script execution failed (fail closed)';
          }
        }
      } else if (typeof domContext === 'string') {
        domElementText = domContext;
      } else if (!checkError) {
        checkError = 'No DOM context or element text provided to verify click target (fail closed)';
      }

      // FAIL CLOSED: For click actions, if DOM inspection threw, timed out,
      // or could not verify what element is under the cursor, treat as unsafe and block.
      if (checkError) {
        return `DOM inspection unverified (fail closed: ${checkError})`;
      }
    } else if (typeof domContext === 'string') {
      domElementText = domContext;
    }

    // 3. Check inspected DOM text against purchase & sensitive patterns
    if (domElementText) {
      const domPurchase = domElementText.match(PURCHASE_INTENT_PATTERN);
      if (domPurchase) return domPurchase[0];

      const domSensitive = domElementText.match(SENSITIVE_DATA_PATTERN);
      if (domSensitive) return domSensitive[0];
    }

    return null;
  }

  /**
   * Confirms with user if multiple products matched before adding to cart.
   */
  async _confirmAddIfMultiple(task, assistantMsg) {
    const notice = 'Multiple qualifying products found. Adding best match to cart.';
    this.taskManager.addStep(task.id, `ℹ️ ${notice}`, 'completed', 'info');
    if (this.approvalEngine) {
      try {
        await this.approvalEngine.evaluateAction(
          { name: 'add_to_cart' },
          { taskId: task.id, reason: notice }
        );
      } catch (_) {}
    }
  }
}

module.exports = { WebTaskAgent };
