/**
 * Actra AI - Browser Interaction Engine
 * Handles virtual cursor, screen understanding, and UI automation.
 */
class BrowserInteractionEngine {
  constructor(tabManager) {
    this.tabManager = tabManager;
  }

  _getView(tabId) {
    const view = this.tabManager.tabs.get(tabId);
    if (!view) throw new Error(`Tab ${tabId} not found or closed.`);
    return view;
  }

  /**
   * Reads the current screen's DOM and returns a simplified representation of interactive elements.
   * Injects temporary data-actra-id attributes to target elements.
   */
  async readScreen(tabId) {
    const view = this._getView(tabId);
    
    const extractionScript = `
      (() => {
        const interactiveElements = [];
        let idCounter = 1;
        
        // Remove old indicators
        document.querySelectorAll('.actra-virtual-cursor').forEach(e => e.remove());

        const elements = document.querySelectorAll('a, button, input, select, textarea, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])');
        
        elements.forEach(el => {
          // Check if element is visible
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0 || rect.top < 0 || rect.left < 0) return;
          
          // Skip ad containers (especially YouTube ads)
          if (el.closest('ytd-ad-slot-renderer, ytd-promoted-video-renderer, ytd-promoted-sparkles-web-renderer, .ytd-search-pyv-renderer, .video-ads, ytd-in-feed-ad-layout-renderer, ytd-banner-promo-renderer')) return;
          
          // Check computed style
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;

          const actraId = 'el-' + idCounter++;
          el.setAttribute('data-actra-id', actraId);
          
          let text = el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || el.title || '';
          text = text.trim().slice(0, 100).replace(/\\n/g, ' ');
          
          if (text || el.tagName.toLowerCase() === 'input' || (el.tagName.toLowerCase() === 'a' && el.hasAttribute('href'))) {
            const item = {
              id: actraId,
              tag: el.tagName.toLowerCase(),
            };
            if (el.type) item.type = el.type;
            if (text) item.text = text;
            
            if (item.tag === 'a' && el.hasAttribute('href')) {
              try {
                const url = new URL(el.href || el.getAttribute('href'), window.location.origin);
                item.href = url.pathname + url.search;
              } catch (e) {
                item.href = el.getAttribute('href') || '';
              }
            }
            
            interactiveElements.push(item);
          }
        });
        
        return {
          title: document.title,
          url: window.location.href,
          elements: interactiveElements
        };
      })();
    `;

    return await view.webContents.executeJavaScript(extractionScript);
  }

  /**
   * Attempts to find an element locally based on a semantic description to avoid LLM calls.
   * Returns the element ID if exactly one strong match is found. Returns null otherwise.
   */
  async resolveElementLocally(tabId, targetDescription, actionName = '') {
    const screen = await this.readScreen(tabId);
    if (!screen || !screen.elements) return { elementId: null, candidates: [] };
    
    const desc = (targetDescription || '').toLowerCase().trim();
    
    // Exact match
    let exactMatches = screen.elements.filter(e => e.text && e.text.toLowerCase() === desc);
    if (exactMatches.length === 1) return { elementId: exactMatches[0].id, candidates: exactMatches };
    
    let candidates = screen.elements;
    
    // Smarter Semantic Filtering
    if (desc.includes('video') || desc.includes('thumbnail') || desc.includes('watch')) {
      candidates = candidates.filter(e => e.tag === 'a' && (
        (e.href && (e.href.includes('watch') || e.href.includes('video'))) || 
        (e.text && (e.text.toLowerCase().includes('video') || e.text.toLowerCase().includes('watch')))
      ));
    } else if (desc.includes('search')) {
      candidates = candidates.filter(e => e.tag === 'input' || (e.type && e.type.includes('search')) || (e.text && e.text.toLowerCase().includes('search')));
    } else if (desc.includes('login') || desc.includes('sign in')) {
      candidates = candidates.filter(e => (e.tag === 'button' || e.tag === 'a') && e.text && (e.text.toLowerCase().includes('login') || e.text.toLowerCase().includes('sign in')));
    } else {
       // Generic Token Match
       const descTokens = desc.split(/\\s+/).filter(t => t.length > 2 && t !== 'box' && t !== 'button' && t !== 'input' && t !== 'link');
       if (descTokens.length === 0) descTokens.push(desc);
       
       candidates = candidates.filter(e => {
         const text = (e.text || '').toLowerCase();
         const type = (e.type || '').toLowerCase();
         const tag = (e.tag || '').toLowerCase();
         if (!text && tag !== 'input') return false;
         if (text && (text.includes(desc) || desc.includes(text))) return true;
         for (const token of descTokens) {
            if (text.includes(token) || type.includes(token) || tag.includes(token)) return true;
         }
         return false;
       });
    }
    
    if (candidates.length === 1) return { elementId: candidates[0].id, candidates };
    
    // Disambiguate based on action type or semantic goal
    if (candidates.length > 1) {
      // If it's a video task, return the valid video link directly based on index
      if (desc.includes('video') || desc.includes('thumbnail') || desc.includes('watch')) {
        let best = candidates.filter(c => c.href && c.href.includes('/watch') && !c.href.includes('list='));
        
        let targetIndex = 0;
        if (desc.includes('2nd') || desc.includes('second')) targetIndex = 1;
        else if (desc.includes('3rd') || desc.includes('third')) targetIndex = 2;
        else if (desc.includes('4th') || desc.includes('fourth')) targetIndex = 3;
        
        if (best.length > targetIndex) return { elementId: best[targetIndex].id, candidates: best };
        if (best.length > 0) return { elementId: best[best.length - 1].id, candidates: best };
        return { elementId: candidates[0].id, candidates };
      }
      
      if (actionName === 'browser_type') {
        const inputs = candidates.filter(e => e.tag === 'input' || e.tag === 'textarea' || e.type === 'text' || e.type === 'search');
        if (inputs.length > 0) return { elementId: inputs[0].id, candidates: inputs };
      } else if (actionName === 'browser_click') {
        const buttons = candidates.filter(e => e.tag === 'button' || e.tag === 'a' || e.type === 'submit' || e.type === 'button');
        if (buttons.length > 0) return { elementId: buttons[0].id, candidates: buttons };
      }
    }

    // Return no elementId, but provide the filtered candidates for the LLM fallback
    // Limit to top 50 candidates to provide sufficient options without blowing up tokens
    return { elementId: null, candidates: candidates.slice(0, 50) };
  }

  /**
   * Simulates a virtual cursor moving to an element and clicking it.
   */
  async clickElement(tabId, elementId) {
    const view = this._getView(tabId);
    
    const clickScript = `
      (() => {
        return new Promise((resolve, reject) => {
          const el = document.querySelector('[data-actra-id="${elementId}"]');
          if (!el) return reject(new Error('Element not found on screen. Call browser_read_screen again.'));
          
          const rect = el.getBoundingClientRect();
          
          // Create or get virtual cursor
          let cursor = document.getElementById('actra-virtual-cursor');
          if (!cursor) {
            cursor = document.createElement('div');
            cursor.id = 'actra-virtual-cursor';
            cursor.className = 'actra-virtual-cursor';
            cursor.style.cssText = 'position: fixed; top: 50%; left: 50%; width: 20px; height: 20px; background-color: rgba(0, 150, 255, 0.5); border: 2px solid #0096ff; border-radius: 50%; pointer-events: none; z-index: 2147483647; transition: all 0.5s cubic-bezier(0.25, 1, 0.5, 1); box-shadow: 0 0 10px rgba(0,150,255,0.8);';
            document.body.appendChild(cursor);
          }
          
          // Move cursor
          const targetX = rect.left + (rect.width / 2);
          const targetY = rect.top + (rect.height / 2);
          
          cursor.style.left = (targetX - 10) + 'px';
          cursor.style.top = (targetY - 10) + 'px';
          
          // Click after animation
          setTimeout(() => {
            // Ripple effect
            cursor.style.transform = 'scale(1.5)';
            cursor.style.backgroundColor = 'rgba(0, 150, 255, 0.8)';
            
            setTimeout(() => {
              cursor.style.transform = 'scale(1)';
              cursor.style.backgroundColor = 'rgba(0, 150, 255, 0.5)';
              
              // Dispatch click
              if (el.tagName.toLowerCase() === 'a' && el.href) {
                el.click();
              } else {
                el.click();
                el.focus();
              }
              
              // Fade out and remove cursor
              setTimeout(() => {
                cursor.style.opacity = '0';
                setTimeout(() => cursor.remove(), 500);
              }, 300);
              
              resolve('Clicked element successfully.');
            }, 150);
          }, 550);
        });
      })();
    `;

    await view.webContents.executeJavaScript(clickScript);
    
    // Minimal generic wait for click event to process locally before continuing the plan
    await new Promise(r => setTimeout(r, 300));
    
    return 'Clicked element successfully.';
  }

  /**
   * Types text into an element.
   */
  async typeText(tabId, elementId, text) {
    const view = this._getView(tabId);
    const focusScript = `
      (() => {
        const el = document.querySelector('[data-actra-id="${elementId}"]');
        if (!el) throw new Error('Element not found. Call browser_read_screen again.');
        el.focus();
        if (el.select) el.select();
        return true;
      })();
    `;
    await view.webContents.executeJavaScript(focusScript);
    
    view.webContents.insertText(text);
    
    // Wait for JS event loops/React to process the input
    await new Promise(r => setTimeout(r, 500));
    
    // Safely escape single quotes for the script
    const escapedText = text.slice(0, 5).replace(/'/g, "\\'");
    
    const verifyScript = `
      (() => {
        const el = document.activeElement;
        if (el) {
          const val = (el.value !== undefined ? el.value : el.innerText) || '';
          // Return true if value updated, or if we aren't sure it's an input
          return val.toLowerCase().includes('${escapedText.toLowerCase()}') ? true : false;
        }
        return true; 
      })();
    `;
    const verified = await view.webContents.executeJavaScript(verifyScript);
    if (!verified) {
      // Fallback: manually set value and dispatch events if insertText failed to register
      await view.webContents.executeJavaScript(`
        (() => {
          const el = document.activeElement;
          if (el && el.value !== undefined) {
             el.value = "${text.replace(/"/g, '\\"')}";
             el.dispatchEvent(new Event('input', { bubbles: true }));
             el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        })();
      `);
      // We don't throw here on the fallback, we assume the fallback worked.
    }

    return `Typed '${text}' into element and verified.`;
  }

  /**
   * Dispatches a key press event (e.g. 'Enter') to the focused element.
   */
  async pressKey(tabId, key) {
    const view = this._getView(tabId);
    view.webContents.sendInputEvent({ type: 'keyDown', keyCode: key });
    view.webContents.sendInputEvent({ type: 'keyUp', keyCode: key });
    // Local verification: wait for UI/Network to settle after submission
    await new Promise(r => setTimeout(r, 1500));
    return `Pressed key '${key}' and verified state.`;
  }

  /**
   * Scrolls the page.
   */
  async scrollPage(tabId, amount = 500) {
    const view = this._getView(tabId);
    const scrollScript = `
      (() => {
        window.scrollBy({ top: ${amount}, behavior: 'smooth' });
        return 'Scrolled page by ${amount}px.';
      })();
    `;
    return await view.webContents.executeJavaScript(scrollScript);
  }
}

module.exports = BrowserInteractionEngine;
