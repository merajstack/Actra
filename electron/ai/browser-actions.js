/**
 * Actra AI — Browser Actions Engine
 * 
 * Provides programmable control over the browser that the AI can invoke.
 * Implements verification loops for consequential actions.
 */

class BrowserActionsEngine {
  constructor(tabManager, pageContextEngine) {
    this.tabManager = tabManager;
    this.pageContext = pageContextEngine;
  }

  /**
   * Helper to wait for a condition to be met in the page.
   */
  async waitForCondition(tabId, script, timeoutMs = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const result = await this.pageContext.executeScript(tabId, script);
        if (result) return true;
      } catch (err) {
        // Ignore errors during polling
      }
      await new Promise(r => setTimeout(r, 500));
    }
    return false;
  }

  async openUrl(tabId, url) {
    return await this.tabManager.navigateTab(tabId, url);
  }

  async createTab(url, isIncognito = false) {
    return await this.tabManager.createTab(url, isIncognito);
  }

  async closeTab(tabId) {
    return await this.tabManager.closeTab(tabId);
  }

  /**
   * Click an element using a CSS selector.
   * Includes verification that the element exists and was clicked.
   */
  async click(tabId, selector) {
    const script = `
      (() => {
        const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
        if (!el) return false;
        
        // Ensure element is visible
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        
        // Scroll into view
        el.scrollIntoView({ behavior: 'instant', block: 'center' });
        
        // Dispatch click
        el.click();
        return true;
      })();
    `;

    const success = await this.pageContext.executeScript(tabId, script);
    if (!success) {
      throw new Error(`Failed to click: Element '${selector}' not found or not visible.`);
    }
    return { success: true, message: `Clicked '${selector}'` };
  }

  /**
   * Type text into an input element.
   */
  async type(tabId, selector, text) {
    const script = `
      (() => {
        const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
        if (!el) return false;
        
        el.scrollIntoView({ behavior: 'instant', block: 'center' });
        el.focus();
        
        // Set value and dispatch events
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(el, '${text.replace(/'/g, "\\'").replace(/\n/g, '\\n')}');
        } else {
          el.value = '${text.replace(/'/g, "\\'").replace(/\n/g, '\\n')}';
        }
        
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })();
    `;

    const success = await this.pageContext.executeScript(tabId, script);
    if (!success) {
      throw new Error(`Failed to type: Element '${selector}' not found.`);
    }
    return { success: true, message: `Typed text into '${selector}'` };
  }

  /**
   * Scroll the page.
   * @param {string} tabId 
   * @param {'up'|'down'|'top'|'bottom'} direction 
   */
  async scroll(tabId, direction) {
    let script = '';
    if (direction === 'top') script = 'window.scrollTo(0, 0);';
    else if (direction === 'bottom') script = 'window.scrollTo(0, document.body.scrollHeight);';
    else if (direction === 'down') script = 'window.scrollBy(0, window.innerHeight * 0.8);';
    else if (direction === 'up') script = 'window.scrollBy(0, -window.innerHeight * 0.8);';
    else return { success: false, message: 'Invalid scroll direction' };

    await this.pageContext.executeScript(tabId, script);
    return { success: true, message: `Scrolled ${direction}` };
  }

  /**
   * Fill multiple fields in a form simultaneously.
   * @param {string} tabId 
   * @param {Object} fieldMap - Record<selector, value>
   */
  async fillForm(tabId, fieldMap) {
    const results = [];
    for (const [selector, value] of Object.entries(fieldMap)) {
      try {
        await this.type(tabId, selector, value);
        results.push({ selector, success: true });
      } catch (err) {
        results.push({ selector, success: false, error: err.message });
      }
    }
    return { success: true, results };
  }
}

module.exports = BrowserActionsEngine;
