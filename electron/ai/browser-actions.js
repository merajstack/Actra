/**
 * Actra AI \u2014 Browser Actions Engine
 *
 * Provides programmable control over the browser that the AI can invoke.
 * Implements post-condition verification for every mutating action:
 *   - Snapshots the target element\u2019s key state before acting.
 *   - Polls up to 3 s after acting for a measurable DOM change.
 *   - Returns { success: false, verified: false, reason } if nothing changed.
 */

class BrowserActionsEngine {
  constructor(tabManager, pageContextEngine) {
    this.tabManager = tabManager;
    this.pageContext = pageContextEngine;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Poll \`script\` every 500 ms until it returns truthy or \`timeoutMs\` elapses.
   */
  async waitForCondition(tabId, script, timeoutMs = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const result = await this.pageContext.executeScript(tabId, script);
        if (result) return true;
      } catch (_) { /* ignore polling errors */ }
      await new Promise(r => setTimeout(r, 500));
    }
    return false;
  }

  /**
   * Capture a compact state snapshot for the element matched by \`selector\`.
   * Returns null if the element does not exist.
   */
  async _captureElementSnapshot(tabId, selector) {
    const esc = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const script = `(() => {
      const el = document.querySelector('${esc}');
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        outerHTML:    (el.outerHTML || '').slice(0, 400),
        value:        el.value != null ? String(el.value) : '',
        checked:      el.checked != null ? Boolean(el.checked) : null,
        ariaSelected: el.getAttribute('aria-selected'),
        ariaChecked:  el.getAttribute('aria-checked'),
        ariaExpanded: el.getAttribute('aria-expanded'),
        classList:    el.className || '',
        visible:      rect.width > 0 && rect.height > 0,
        top:          Math.round(rect.top),
        left:         Math.round(rect.left),
      };
    })();`;
    try {
      return await this.pageContext.executeScript(tabId, script);
    } catch (_) {
      return null;
    }
  }

  /**
   * Return true if \`before\` and \`after\` differ in any meaningful way.
   */
  _snapshotsDiffer(before, after) {
    if (!before || !after) return true;
    if (before.value        !== after.value)        return true;
    if (before.checked      !== after.checked)      return true;
    if (before.ariaSelected !== after.ariaSelected) return true;
    if (before.ariaChecked  !== after.ariaChecked)  return true;
    if (before.ariaExpanded !== after.ariaExpanded)  return true;
    if (before.classList    !== after.classList)    return true;
    if (before.visible      !== after.visible)      return true;
    if (Math.abs((before.top  || 0) - (after.top  || 0)) > 4) return true;
    if (Math.abs((before.left || 0) - (after.left || 0)) > 4) return true;
    if (before.outerHTML    !== after.outerHTML)    return true;
    return false;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Navigation / tab helpers
  // ────────────────────────────────────────────────────────────────────────

  async openUrl(tabId, url) {
    return await this.tabManager.navigateTab(tabId, url);
  }

  async createTab(url, isIncognito = false) {
    return await this.tabManager.createTab(url, isIncognito);
  }

  async closeTab(tabId) {
    return await this.tabManager.closeTab(tabId);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Mutating actions \u2014 with post-condition verification
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Click an element using a CSS selector.
   *
   * Flow:
   *  1. Snapshot element state before clicking.
   *  2. Dispatch click via JS.
   *  3. Poll up to 3 s for any detectable DOM/ARIA/visibility change.
   *  4. Snapshot again and diff.
   *  5. If nothing changed \u2192 { success: false, verified: false, reason }.
   */
  async click(tabId, selector) {
    const before = await this._captureElementSnapshot(tabId, selector);

    const esc = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const clickScript = `(() => {
      const el = document.querySelector('${esc}');
      if (!el) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
      el.click();
      return true;
    })();`;

    const dispatched = await this.pageContext.executeScript(tabId, clickScript);
    if (!dispatched) {
      throw new Error(`Failed to click: Element '${selector}' not found or not visible.`);
    }

    // Encode \`before\` snapshot so the page-side poll can compare against it
    const beforeSerial = before
      ? JSON.stringify({
          v: before.value, c: before.checked, as: before.ariaSelected,
          ac: before.ariaChecked, ae: before.ariaExpanded, cl: before.classList,
          vis: before.visible, h: (before.outerHTML || '').slice(0, 200),
        })
      : 'null';

    const pollScript = `(() => {
      const el = document.querySelector('${esc}');
      if (!el) return true;
      const rect = el.getBoundingClientRect();
      const now = JSON.stringify({
        v:   el.value != null ? String(el.value) : '',
        c:   el.checked != null ? Boolean(el.checked) : null,
        as:  el.getAttribute('aria-selected'),
        ac:  el.getAttribute('aria-checked'),
        ae:  el.getAttribute('aria-expanded'),
        cl:  el.className || '',
        vis: rect.width > 0 && rect.height > 0,
        h:   (el.outerHTML || '').slice(0, 200),
      });
      return now !== ${JSON.stringify(beforeSerial)};
    })();`;

    const changed = await this.waitForCondition(tabId, pollScript, 3000);
    const after   = await this._captureElementSnapshot(tabId, selector);
    const verified = changed || this._snapshotsDiffer(before, after);

    if (!verified) {
      return {
        success:  false,
        verified: false,
        reason:   'dispatched but no state change detected',
        selector,
      };
    }
    return { success: true, verified: true, message: `Clicked '${selector}'` };
  }

  /**
   * Type text into an input element.
   *
   * Flow:
   *  1. Snapshot element value before typing.
   *  2. Set value via native setter + dispatch events.
   *  3. Poll up to 3 s until value contains the typed text.
   *  4. Snapshot again and diff.
   *  5. If nothing changed \u2192 { success: false, verified: false, reason }.
   */
  async type(tabId, selector, text) {
    const before = await this._captureElementSnapshot(tabId, selector);

    const esc     = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const escaped = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');

    const typeScript = `(() => {
      const el = document.querySelector('${esc}');
      if (!el) return false;
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
      el.focus();
      const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      const setter = desc && desc.set;
      if (setter) { setter.call(el, '${escaped}'); }
      else        { el.value = '${escaped}'; }
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })();`;

    const dispatched = await this.pageContext.executeScript(tabId, typeScript);
    if (!dispatched) {
      throw new Error(`Failed to type: Element '${selector}' not found.`);
    }

    // Poll until the element\u2019s value contains the first 50 chars of the typed text
    const probe = escaped.slice(0, 50);
    const pollScript = `(() => {
      const el = document.querySelector('${esc}');
      if (!el) return false;
      const val = el.value != null ? String(el.value) : (el.innerText || '');
      return val.includes('${probe}');
    })();`;

    const changed = await this.waitForCondition(tabId, pollScript, 3000);
    const after   = await this._captureElementSnapshot(tabId, selector);
    const verified = changed || this._snapshotsDiffer(before, after);

    if (!verified) {
      return {
        success:  false,
        verified: false,
        reason:   'dispatched but no state change detected',
        selector,
      };
    }
    return { success: true, verified: true, message: `Typed text into '${selector}'` };
  }

  // ────────────────────────────────────────────────────────────────────────
  // Non-mutating / low-risk actions
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Scroll the page.
   * @param {string} tabId
   * @param {'up'|'down'|'top'|'bottom'} direction
   */
  async scroll(tabId, direction) {
    let script = '';
    if      (direction === 'top')    script = 'window.scrollTo(0, 0);';
    else if (direction === 'bottom') script = 'window.scrollTo(0, document.body.scrollHeight);';
    else if (direction === 'down')   script = 'window.scrollBy(0, window.innerHeight * 0.8);';
    else if (direction === 'up')     script = 'window.scrollBy(0, -window.innerHeight * 0.8);';
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
        const r = await this.type(tabId, selector, value);
        results.push({ selector, success: r.success, reason: r.reason });
      } catch (err) {
        results.push({ selector, success: false, error: err.message });
      }
    }
    return { success: true, results };
  }
}

module.exports = BrowserActionsEngine;
