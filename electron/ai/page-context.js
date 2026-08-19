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
        let idCounter = 1;
        const ensureId = (el, prefix) => {
          if (!el.getAttribute('data-actra-mcq-id')) {
            el.setAttribute('data-actra-mcq-id', prefix + '-' + idCounter++);
          }
          return el.getAttribute('data-actra-mcq-id');
        };

        const escapeCss = (value) => window.CSS?.escape ? CSS.escape(value) : String(value).replace(/"/g, '\\"');
        const getLabel = (input) => input.id ? document.querySelector('label[for="' + escapeCss(input.id) + '"]') : null;
        const optionTextFromElement = (el) => normalize(
          el.innerText ||
          el.textContent ||
          el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          el.getAttribute('data-value') ||
          el.value
        );
        const looksLikeSubmit = (text) => /^(submit|next|continue|check|save|finish|done|skip|previous|back|review)$/i.test(text);
        const looksLikeOption = (el, text) => {
          if (!text || text.length > 500 || looksLikeSubmit(text)) return false;
          const marker = [
            el.getAttribute('class'),
            el.getAttribute('id'),
            el.getAttribute('role'),
            el.getAttribute('data-testid'),
            el.getAttribute('data-test'),
          ].filter(Boolean).join(' ').toLowerCase();
          return /option|answer|choice|mcq|radio|quiz/.test(marker) || /^[a-d][.)\\s]/i.test(text);
        };

        const labelFor = (input) => {
          const id = getLabel(input);
          const wrappingLabel = input.closest('label');
          const aria = input.getAttribute('aria-label') || input.getAttribute('title') || input.value;
          const nearby = input.parentElement ? input.parentElement.innerText : '';
          return normalize(id?.innerText || wrappingLabel?.innerText || aria || nearby);
        };

        const inputOptions = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]'))
          .filter(input => !input.disabled && (isVisible(input) || isVisible(getLabel(input)) || isVisible(input.closest('label'))))
          .map((input, index) => ({
            id: ensureId(input, 'option'),
            index,
            text: labelFor(input),
            value: input.value || '',
            checked: input.checked,
            type: input.type
          }))
          .filter(option => option.text || option.value);

        const roleOptions = Array.from(document.querySelectorAll('[role="radio"], [role="option"], [aria-checked], [aria-selected]'))
          .filter(el => isVisible(el) && !['INPUT', 'BUTTON'].includes(el.tagName))
          .map((el, index) => ({
            id: ensureId(el, 'option'),
            index: inputOptions.length + index,
            text: optionTextFromElement(el),
            value: el.getAttribute('data-value') || '',
            checked: el.getAttribute('aria-checked') === 'true',
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
          .filter(button => !looksLikeSubmit(button.text))
          .map((button, index) => ({
            id: button.id,
            index: inputOptions.length + roleOptions.length + index,
            text: button.text,
            value: '',
            checked: false,
            type: 'button'
          }));

        const selectorOptions = Array.from(document.querySelectorAll(
          '[class*="option"], [class*="answer"], [class*="choice"], [id*="option"], [id*="answer"], [id*="choice"], li'
        ))
          .filter(el => isVisible(el) && !el.querySelector('input[type="radio"], input[type="checkbox"]'))
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
            const key = option.text.toLowerCase();
            if (!key || seenOptionText.has(key)) return false;
            seenOptionText.add(key);
            return true;
          })
          .map((option, index) => ({ ...option, index }));

        const submitButton = buttons.find(button =>
          /submit|next|continue|check|save|finish|done/i.test(button.text)
        ) || null;

        const bodyText = normalize(document.body?.innerText || '').slice(0, 10000);
        const hasQuestionSignal = options.length > 0 || /question|choose|select|answer/i.test(bodyText);

        return {
          title: document.title,
          url: window.location.href,
          bodyText,
          options,
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
        const input = document.querySelector('[data-actra-mcq-id="${String(optionId).replace(/"/g, '\\"')}"]');
        if (!input) return { success: false, reason: 'option_not_found' };

        input.scrollIntoView({ block: 'center', inline: 'center' });
        input.focus();
        input.click();
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

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
          button.scrollIntoView({ block: 'center', inline: 'center' });
          button.focus();
          button.click();
          return { success: true, method: 'button' };
        }

        const form = document.querySelector('input[type="radio"]:checked, input[type="checkbox"]:checked')?.form || document.querySelector('form');
        if (form && typeof form.requestSubmit === 'function') {
          form.requestSubmit();
          return { success: true, method: 'form' };
        }

        return { success: false, reason: 'submit_not_found' };
      })();
    `;

    return await view.webContents.executeJavaScript(script);
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
