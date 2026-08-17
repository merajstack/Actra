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

        return {
          metaDescription,
          bodyText,
          interactiveElements: elements.slice(0, 50) // Limit to 50 elements
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
