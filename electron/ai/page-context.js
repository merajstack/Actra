/**
 * Actra AI — Page Context Engine
 * 
 * Extracts structured context from the active BrowserView.
 * Provides the AI with DOM semantics, visible text, interactive elements,
 * and page metadata without requiring raw HTML parsing.
 */

class PageContextEngine {
  constructor(tabManager) {
    this.tabManager = tabManager;
    /** Cache: Map<`${tabId}::${url}`, boolean> — set once per page load */
    this._mcqDetectionCache = new Map();
  }

  /**
   * Get the complete structured context for a specific tab.
   * @param {string} tabId 
   * @returns {Promise<Object>}
   */
  async getContext(tabId) {
    const view = this.tabManager.tabs.get(tabId);
    if (!view) throw new Error(`Tab ${tabId} not found`);

    const url = view.webContents.getURL();
    const title = view.webContents.getTitle();
    
    // Inject and execute extraction script
    // We only extract visible text and interactive elements to keep context size manageable
    const script = `
      (() => {
        const elements = [];
        const interactiveSelectors = 'a, button, input, select, textarea, [role="button"], [role="link"]';
        
        document.querySelectorAll(interactiveSelectors).forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return; // Hidden
          
          let actionText = el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || el.title || '';
          actionText = actionText.trim().substring(0, 100); // Truncate long text
          if (!actionText) return;

          elements.push({
            tag: el.tagName.toLowerCase(),
            type: el.type || undefined,
            text: actionText,
            id: el.id || undefined,
            name: el.name || undefined,
            role: el.getAttribute('role') || undefined,
            href: el.href || undefined,
          });
        });

        const metaDescription = document.querySelector('meta[name="description"]')?.content || '';
        const bodyText = (document.body.innerText || '').replace(/\\s+/g, ' ').substring(0, 5000); // Limit to 5k chars

        // Objective Scroll Metrics
        const scrollY = window.scrollY || document.documentElement.scrollTop;
        const innerHeight = window.innerHeight;
        const scrollHeight = document.documentElement.scrollHeight;
        const atBottom = scrollY + innerHeight >= scrollHeight - 50;

        return {
          metaDescription,
          bodyText,
          interactiveElements: elements.slice(0, 50), // Limit to 50 elements
          scroll: { scrollY, innerHeight, scrollHeight, atBottom }
        };
      })();
    `;

    try {
      const extracted = await view.webContents.executeJavaScript(script);
      
      return {
        url,
        title,
        ...extracted
      };
    } catch (err) {
      console.error('[PageContextEngine] Failed to extract context:', err);
      return { url, title, error: 'Failed to extract DOM context' };
    }
  }

  /**
   * Get the text currently selected by the user.
   * @param {string} tabId 
   * @returns {Promise<string>}
   */
  async getSelectedText(tabId) {
    const view = this.tabManager.tabs.get(tabId);
    if (!view) return '';

    try {
      return await view.webContents.executeJavaScript('window.getSelection().toString()');
    } catch {
      return '';
    }
  }

  /**
   * Execute an arbitrary script in the context of the page.
   * @param {string} tabId 
   * @param {string} script 
   * @returns {Promise<any>}
   */
  async executeScript(tabId, script) {
    const view = this.tabManager.tabs.get(tabId);
    if (!view) throw new Error(`Tab ${tabId} not found`);

    return await view.webContents.executeJavaScript(script);
  }

  /**
   * Extract readable text from the current page for downstream actions.
   * This intentionally reads the full document text, not only the visible viewport.
   */
  async extractPageText(tabId, maxChars = 50000) {
    const view = this.tabManager.tabs.get(tabId);
    if (!view) throw new Error(`Tab ${tabId} not found`);

    const limit = Number.isFinite(maxChars) && maxChars > 0 ? Math.floor(maxChars) : 50000;
    const script = `
      (() => {
        const root = document.querySelector('main, article, #mw-content-text, .mw-parser-output') || document.body;
        const rawText = root?.innerText || document.body?.innerText || '';
        const text = rawText
          .replace(/[ \\t]+\\n/g, '\\n')
          .replace(/\\n{3,}/g, '\\n\\n')
          .trim();

        return {
          title: document.title,
          url: window.location.href,
          text: text.slice(0, ${limit}),
          length: text.length,
          truncated: text.length > ${limit}
        };
      })();
    `;

    return await view.webContents.executeJavaScript(script);
  }

  /**
   * Extract a compact multiple-choice question view from the page.
   */
  async getMCQContext(tabId) {
    const view = this.tabManager.tabs.get(tabId);
    if (!view) throw new Error(`Tab ${tabId} not found`);

    const script = `
      (() => {
        const isVisible = (el) => {
          if (!el) return false;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        };

        const normalize = (text) => String(text || '').replace(/\\s+/g, ' ').trim();

        // Clear any previous Actra MCQ IDs so recycled or SPA elements get fresh clean IDs
        try {
          document.querySelectorAll('[data-actra-mcq-id]').forEach(el => el.removeAttribute('data-actra-mcq-id'));
        } catch {}

        let idCounter = 1;
        const ensureId = (el, prefix) => {
          if (!el.getAttribute('data-actra-mcq-id')) {
            el.setAttribute('data-actra-mcq-id', prefix + '-' + idCounter++);
          }
          return el.getAttribute('data-actra-mcq-id');
        };

        const escapeCss = (value) => window.CSS?.escape ? CSS.escape(value) : String(value).replace(/"/g, '\\"');
        const getLabel = (input) => input.id ? document.querySelector('label[for="' + escapeCss(input.id) + '"]') : null;
        
        const optionTextFromElement = (el) => {
          if (!el) return '';
          // Avoid grabbing full page text if el is a giant container
          const text = el.innerText || el.textContent || '';
          return normalize(
            text ||
            el.getAttribute('aria-label') ||
            el.getAttribute('title') ||
            el.getAttribute('data-value') ||
            el.value ||
            ''
          );
        };

        const looksLikeSubmit = (text) => /^(submit|submit answer|check|check answer|verify|save|save & next|save and next|next|next question|continue|proceed|finish|done|skip|previous|back|review|confirm)$/i.test(text);

        const looksLikeOption = (el, text) => {
          if (!text || text.length > 500 || looksLikeSubmit(text)) return false;
          const marker = [
            el.getAttribute('class'),
            el.getAttribute('id'),
            el.getAttribute('role'),
            el.getAttribute('data-testid'),
            el.getAttribute('data-test'),
            el.getAttribute('data-choice'),
            el.getAttribute('data-value'),
          ].filter(Boolean).join(' ').toLowerCase();
          return /option|answer|choice|mcq|radio|checkbox|quiz|selection|item|variant|alternative/.test(marker) || /^[a-h][.)\\s]/i.test(text) || /^[1-9][.)\\s]/i.test(text);
        };

        const labelFor = (input) => {
          const idLabel = getLabel(input);
          if (idLabel && isVisible(idLabel)) {
            const txt = normalize(idLabel.innerText || idLabel.textContent);
            if (txt) return txt;
          }
          const wrappingLabel = input.closest('label');
          if (wrappingLabel) {
            const txt = normalize(wrappingLabel.innerText || wrappingLabel.textContent);
            if (txt) return txt;
          }
          const ariaLabel = input.getAttribute('aria-label') || input.getAttribute('title');
          if (ariaLabel) return normalize(ariaLabel);
          
          const ariaId = input.getAttribute('aria-labelledby');
          if (ariaId) {
            const labelledEl = document.getElementById(ariaId);
            if (labelledEl) {
              const txt = normalize(labelledEl.innerText || labelledEl.textContent);
              if (txt) return txt;
            }
          }

          if (input.nextElementSibling && isVisible(input.nextElementSibling)) {
            const txt = normalize(input.nextElementSibling.innerText || input.nextElementSibling.textContent);
            if (txt && txt.length < 500) return txt;
          }

          if (input.parentElement) {
            // Check parent if parent doesn't contain multiple inputs
            const inputsInParent = input.parentElement.querySelectorAll('input[type="radio"], input[type="checkbox"]');
            if (inputsInParent.length <= 1) {
              const txt = normalize(input.parentElement.innerText || input.parentElement.textContent);
              if (txt && txt.length < 500) return txt;
            }
          }

          return input.value || '';
        };

        const inputOptions = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]'))
          .filter(input => !input.disabled && (isVisible(input) || isVisible(getLabel(input)) || isVisible(input.closest('label')) || isVisible(input.parentElement)))
          .map((input, index) => ({
            id: ensureId(input, 'option'),
            index,
            text: labelFor(input),
            value: input.value || '',
            checked: Boolean(input.checked),
            type: input.type
          }))
          .filter(option => option.text || option.value);

        const roleOptions = Array.from(document.querySelectorAll('[role="radio"], [role="checkbox"], [role="option"], [aria-checked], [aria-selected]'))
          .filter(el => isVisible(el) && !['INPUT', 'BUTTON'].includes(el.tagName))
          .map((el, index) => ({
            id: ensureId(el, 'option'),
            index: inputOptions.length + index,
            text: optionTextFromElement(el),
            value: el.getAttribute('data-value') || '',
            checked: el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-selected') === 'true',
            type: el.getAttribute('role') || 'option'
          }))
          .filter(option => option.text || option.value);

        const buttonSelectors = 'button, input[type="submit"], input[type="button"], [role="button"]';
        const buttons = Array.from(document.querySelectorAll(buttonSelectors))
          .filter(button => !button.disabled && isVisible(button))
          .map((button, index) => ({
            id: ensureId(button, 'button'),
            index,
            text: optionTextFromElement(button),
            type: button.type || ''
          }))
          .filter(button => button.text);

        const buttonOptions = buttons
          .filter(button => !looksLikeSubmit(button.text) && button.text.length < 300)
          .map((button, index) => ({
            id: button.id,
            index: inputOptions.length + roleOptions.length + index,
            text: button.text,
            value: '',
            checked: false,
            type: 'button'
          }));

        const selectorOptions = Array.from(document.querySelectorAll(
          '[class*="option"], [class*="answer"], [class*="choice"], [id*="option"], [id*="answer"], [id*="choice"], [class*="quiz"], [class*="selection"], [class*="item"], li'
        ))
          .filter(el => isVisible(el) && !el.querySelector('input[type="radio"], input[type="checkbox"]') && !['INPUT', 'BUTTON', 'A', 'BODY', 'HTML', 'MAIN', 'NAV', 'HEADER', 'FOOTER'].includes(el.tagName))
          .map(el => ({ el, text: optionTextFromElement(el) }))
          .filter(({ el, text }) => looksLikeOption(el, text))
          .map(({ el, text }, index) => ({
            id: ensureId(el, 'option'),
            index: inputOptions.length + roleOptions.length + buttonOptions.length + index,
            text,
            value: '',
            checked: false,
            type: 'element'
          }));

        const seenOptionText = new Set();
        const options = [...inputOptions, ...roleOptions, ...buttonOptions, ...selectorOptions]
          .filter(option => {
            const key = option.text.toLowerCase().trim();
            if (!key || seenOptionText.has(key)) return false;
            seenOptionText.add(key);
            return true;
          })
          .map((option, index) => ({
            ...option,
            index,
            letter: String.fromCharCode(65 + index), // A, B, C, D...
          }));

        const answerInputs = Array.from(document.querySelectorAll(
          'textarea, input[type="text"], input[type="number"], input[type="email"]'
        ))
          .filter(input => !input.disabled && isVisible(input))
          .map((input, index) => ({
            id: ensureId(input, 'answer'),
            index,
            placeholder: input.placeholder || '',
            value: input.value || '',
            type: input.type || 'text'
          }));

        const submitButton = buttons.find(button =>
          looksLikeSubmit(button.text)
        ) || null;

        const bodyText = normalize(document.body?.innerText || '').slice(0, 10000);
        const hasQuestionSignal = options.length > 0 || /question|choose|select|answer|which of the following|what is/i.test(bodyText);

        return {
          title: document.title,
          url: window.location.href,
          bodyText,
          options,
          answerInputs,
          buttons,
          submitButton,
          hasQuestionSignal,
        };
      })();
    `;

    return await view.webContents.executeJavaScript(script);
  }

  async selectMCQOption(tabId, optionId) {
    const view = this.tabManager.tabs.get(tabId);
    if (!view) throw new Error(`Tab ${tabId} not found`);

    const script = `
      (() => {
        const idStr = "${String(optionId).replace(/"/g, '\\"')}";
        let el = document.querySelector('[data-actra-mcq-id="' + idStr + '"]');
        
        if (!el) return { success: false, reason: 'option_not_found' };

        el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });

        const isInput = el.tagName === 'INPUT';
        const isCheckable = isInput && (el.type === 'radio' || el.type === 'checkbox');

        if (isCheckable) {
          try {
            const proto = Object.getPrototypeOf(el);
            const setter = Object.getOwnPropertyDescriptor(proto, 'checked')?.set;
            if (setter) setter.call(el, true);
            else el.checked = true;
          } catch {}
        }

        // Fire full pointer and mouse event pipeline for React / Vue / native listeners
        const targets = [el];
        if (isInput) {
          const label = el.closest('label') || (el.id ? document.querySelector('label[for="' + CSS.escape(el.id) + '"]') : null);
          if (label) targets.push(label);
        } else {
          const innerInput = el.querySelector('input[type="radio"], input[type="checkbox"]');
          if (innerInput) {
            try {
              const proto = Object.getPrototypeOf(innerInput);
              const setter = Object.getOwnPropertyDescriptor(proto, 'checked')?.set;
              if (setter) setter.call(innerInput, true);
              else innerInput.checked = true;
            } catch {}
            targets.push(innerInput);
          }
        }

        for (const target of targets) {
          try { target.focus(); } catch {}
          try { target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); } catch {}
          try { target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); } catch {}
          try { target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true })); } catch {}
          try { target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true })); } catch {}
          try { target.click(); } catch {}
          try { target.dispatchEvent(new Event('input', { bubbles: true, composed: true })); } catch {}
          try { target.dispatchEvent(new Event('change', { bubbles: true, composed: true })); } catch {}
        }

        if (el.getAttribute('role') === 'radio' || el.getAttribute('role') === 'checkbox') {
          el.setAttribute('aria-checked', 'true');
        }

        return { success: true };
      })();
    `;

    return await view.webContents.executeJavaScript(script);
  }

  async fillMCQAnswer(tabId, answerId, value) {
    const view = this.tabManager.tabs.get(tabId);
    if (!view) throw new Error(`Tab ${tabId} not found`);

    const escapedAnswerId = String(answerId || '').replace(/"/g, '\\"');
    const serializedValue = JSON.stringify(String(value ?? ''));
    const script = `
      (() => {
        const input = document.querySelector('[data-actra-mcq-id="${escapedAnswerId}"]');
        if (!input) return { success: false, reason: 'answer_input_not_found' };
        input.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
        input.focus();
        const prototype = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (setter) setter.call(input, ${serializedValue});
        else input.value = ${serializedValue};
        input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        return { success: true };
      })();
    `;

    return await view.webContents.executeJavaScript(script);
  }

  async submitMCQAnswer(tabId, buttonId) {
    const view = this.tabManager.tabs.get(tabId);
    if (!view) throw new Error(`Tab ${tabId} not found`);

    const escapedButtonId = buttonId ? String(buttonId).replace(/"/g, '\\"') : '';
    const script = `
      (() => {
        const button = ${escapedButtonId ? `document.querySelector('[data-actra-mcq-id="${escapedButtonId}"]')` : 'null'};

        if (button) {
          button.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
          try { button.focus(); } catch {}
          try { button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); } catch {}
          try { button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); } catch {}
          try { button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true })); } catch {}
          try { button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true })); } catch {}
          button.click();
          return { success: true, method: 'button' };
        }

        return { success: false, reason: 'submit_not_found' };
      })();
    `;

    return await view.webContents.executeJavaScript(script);
  }

  /**
   * Detect whether the current page looks like an MCQ / quiz page.
   *
   * Heuristics (OR-combined):
   *  A) ≥ 2 visible radio or checkbox inputs
   *  B) ≥ 2 elements with [role="radio"|"checkbox"|"option"] or aria-checked
   *  C) ≥ 2 list items / divs whose text starts with a letter/number option
   *     marker AND the page body contains a question-like signal
   *
   * Result is cached per tabId+url so this DOM pass runs only once per page load.
   *
   * @param {string} tabId
   * @returns {Promise<boolean>}
   */
  async detectMCQPage(tabId) {
    const view = this.tabManager.tabs.get(tabId);
    if (!view) return false;

    const url = view.webContents.getURL();
    const cacheKey = `${tabId}::${url}`;
    if (this._mcqDetectionCache.has(cacheKey)) {
      return this._mcqDetectionCache.get(cacheKey);
    }

    const script = `
      (() => {
        const isVisible = (el) => {
          if (!el) return false;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return false;
          const s = window.getComputedStyle(el);
          return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0;
        };

        // A) Native radio / checkbox inputs
        const radioCheckCount = Array.from(
          document.querySelectorAll('input[type="radio"], input[type="checkbox"]')
        ).filter(el => isVisible(el) || isVisible(el.closest('label')) || isVisible(el.parentElement)).length;
        if (radioCheckCount >= 2) return true;

        // B) ARIA role options
        const ariaOptionCount = Array.from(
          document.querySelectorAll('[role="radio"],[role="checkbox"],[role="option"],[aria-checked]')
        ).filter(el => !['INPUT','BUTTON'].includes(el.tagName) && isVisible(el)).length;
        if (ariaOptionCount >= 2) return true;

        // C) Styled list / div options near question text
        const bodyText = (document.body && document.body.innerText) ? document.body.innerText : '';
        const hasQuestionSignal = /\\b(question|choose|select|which (of|is|are)|what (is|are|does)|answer|correct option)\\b/i.test(bodyText);
        if (hasQuestionSignal) {
          const optionMarker = /^[a-hA-H1-9][.)\\s]/;
          const candidates = Array.from(
            document.querySelectorAll(
              'li, [class*="option"], [class*="choice"], [class*="answer"], [id*="option"], [id*="answer"]'
            )
          ).filter(el => {
            if (!isVisible(el)) return false;
            const text = (el.innerText || el.textContent || '').trim();
            return optionMarker.test(text) && text.length > 1 && text.length < 400;
          });
          if (candidates.length >= 2) return true;
        }

        return false;
      })()
    `;

    let result = false;
    try {
      result = Boolean(await view.webContents.executeJavaScript(script));
    } catch (err) {
      console.warn('[PageContextEngine] detectMCQPage failed:', err.message);
    }

    // Evict stale entries to avoid unbounded growth (keep ≤ 200 tabs)
    if (this._mcqDetectionCache.size >= 200) {
      const firstKey = this._mcqDetectionCache.keys().next().value;
      this._mcqDetectionCache.delete(firstKey);
    }
    this._mcqDetectionCache.set(cacheKey, result);
    return result;
  }

  /**
   * Invalidate the MCQ detection cache for a specific tab (call on navigation).
   * @param {string} tabId
   */
  clearMCQDetectionCache(tabId) {
    for (const key of this._mcqDetectionCache.keys()) {
      if (key.startsWith(`${tabId}::`)) {
        this._mcqDetectionCache.delete(key);
      }
    }
  }

  /**
   * Detect whether the current page is a sequential (one-question-at-a-time)
   * quiz — as opposed to a multi-question MCQ page.
   *
   * Signals:
   *   A) A visible countdown timer element (mm:ss text or timer-labelled el)
   *   B) A single question block with 2–6 selectable options visible
   *   C) A Submit / Next / Show Answer button visible
   *   D) Question counter (e.g. "Question 1 of 10", "1 / 10", "Q1")
   *
   * Sequential mode is true when a single question block (2–6 options) is present
   * alongside an action button, countdown timer, or question counter.
   *
   * @param {string} tabId
   * @returns {Promise<{ isSequential: boolean, timerText: string, optionCount: number, hasSingleBlock: boolean, hasActionButton: boolean }>}
   */
  async detectSequentialQuizMode(tabId) {
    const view = this.tabManager.tabs.get(tabId);
    if (!view) return { isSequential: false, timerText: '', optionCount: 0, hasSingleBlock: false, hasActionButton: false };

    const script = `
      (() => {
        const isVisible = (el) => {
          if (!el) return false;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return false;
          const s = window.getComputedStyle(el);
          return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0;
        };

        // ── Signal A: countdown timer ─────────────────────────────────────
        const TIMER_RE = /\\b\\d{1,2}:\\d{2}(:\\d{2})?\\b/;
        const TIMER_LABEL_RE = /\\b(timer|time left|time remaining|countdown|time|remaining)\\b/i;

        let timerText = '';
        const allElements = Array.from(document.querySelectorAll('*'));
        for (const el of allElements) {
          if (!isVisible(el)) continue;
          const directText = Array.from(el.childNodes)
            .filter(n => n.nodeType === Node.TEXT_NODE)
            .map(n => n.textContent.trim())
            .join(' ');
          if (TIMER_RE.test(directText)) {
            timerText = directText.trim().slice(0, 20);
            break;
          }
        }
        if (!timerText) {
          const timerEl = document.querySelector(
            '[class*="timer"],[class*="countdown"],[id*="timer"],[id*="countdown"],[aria-label*="timer"],[aria-label*="time"]'
          );
          if (timerEl && isVisible(timerEl)) {
            const t = (timerEl.innerText || timerEl.textContent || '').trim();
            if (t && (TIMER_RE.test(t) || TIMER_LABEL_RE.test(timerEl.getAttribute('aria-label') || ''))) {
              timerText = t.slice(0, 20);
            }
          }
        }
        const hasTimer = Boolean(timerText);

        // ── Signal B: 2–6 selectable options (single question block) ──────
        const optionSelectors = [
          'input[type="radio"]',
          'input[type="checkbox"]',
          '[role="radio"]',
          '[role="checkbox"]',
          '[role="option"]',
          '[aria-checked]',
          '[class*="option"]:not(body):not(html)',
          '[class*="choice"]:not(body):not(html)',
        ];

        const getOptionText = (el) => {
          if (el.tagName === 'INPUT') {
            const label = el.labels?.[0] || el.closest('label') || (el.id ? document.querySelector('label[for="' + (window.CSS?.escape ? CSS.escape(el.id) : el.id) + '"]') : null);
            const labelText = (label?.innerText || label?.textContent || '').trim();
            if (labelText) return labelText;
            if (el.value) return el.value;
            return 'option';
          }
          return (el.innerText || el.textContent || el.getAttribute('aria-label') || '').trim();
        };

        const visibleOptions = Array.from(
          document.querySelectorAll(optionSelectors.join(','))
        ).filter(el => {
          if (!isVisible(el)) return false;
          if (['INPUT','BODY','HTML'].includes(el.tagName) && el.type !== 'radio' && el.type !== 'checkbox') return false;
          const t = getOptionText(el);
          return t.length > 0 && t.length < 400;
        });
        const optionCount = visibleOptions.length;
        const hasSingleBlock = optionCount >= 2 && optionCount <= 6;

        // ── Signal C: Submit / Next / Show Answer button ──────────────────
        const ACTION_RE = /\\b(submit|submit answer|check|next|next question|continue|proceed|show answer|reveal answer|mark|mark for review|save|save & next|save and next)\\b/i;
        const hasActionButton = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"], a[role="button"]'))
          .some(el => isVisible(el) && ACTION_RE.test((el.innerText || el.value || el.textContent || el.getAttribute('aria-label') || '').trim()));

        // ── Signal D: Question counter (e.g. "Question 1 of 10", "1 / 10", "Q1") ──
        const bodyText = (document.body && document.body.innerText) ? document.body.innerText : '';
        const COUNTER_RE = /\\b(question\\s*\\d+\\s*(of|\\/)\\s*\\d+|\\d+\\s*\\/\\s*\\d+|q\\s*\\d+)\\b/i;
        const hasCounter = COUNTER_RE.test(bodyText);

        const isSequential = hasSingleBlock && (hasActionButton || hasTimer || hasCounter);

        return {
          hasTimer,
          timerText,
          optionCount,
          hasSingleBlock,
          hasActionButton,
          hasCounter,
          isSequential,
        };
      })()
    `;

    try {
      const result = await view.webContents.executeJavaScript(script);
      return {
        isSequential: Boolean(result?.isSequential),
        timerText: String(result?.timerText || ''),
        optionCount: Number(result?.optionCount || 0),
        hasSingleBlock: Boolean(result?.hasSingleBlock),
        hasActionButton: Boolean(result?.hasActionButton),
      };
    } catch (err) {
      console.warn('[PageContextEngine] detectSequentialQuizMode failed:', err.message);
      return { isSequential: false, timerText: '', optionCount: 0, hasSingleBlock: false, hasActionButton: false };
    }
  }

  /**
   * Get a summary of all open tabs.
   * @returns {Array<{id: string, url: string, title: string}>}
   */
  getAllTabsSummary() {

    return Array.from(this.tabManager.tabs.entries()).map(([id, view]) => ({
      id,
      url: view.webContents.getURL(),
      title: view.webContents.getTitle()
    }));
  }
}

module.exports = PageContextEngine;
