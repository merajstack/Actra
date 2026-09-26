/**
 * Actra AI — Grounding Router
 *
 * Consolidates all element-resolution backends into ONE explicit serial pipeline:
 *
 *   STEP 1 — DOM Semantic Match  (zero LLM, zero network)
 *     Uses data-actra-id elements already stamped by BrowserInteractionEngine.readScreen().
 *     Computes a token-overlap confidence score against each element's visible
 *     text / aria-label / placeholder.
 *     confidence >= 0.75  → strategy "dom", return immediately.
 *     confidence 0.4–0.75 → continue to step 2 but pass the best-candidate DOM
 *                            along to give LLM a smaller search space.
 *
 *   STEP 2 — LLM Semantic Fallback  (local text model, no screenshot)
 *     Calls PlannerEngine.resolveElementFallback() with the compact DOM.
 *     On success → strategy "llm".
 *
 *   STEP 3 — Remote UI-TARS Vision  (HTTP, production VLM)
 *     Health-checks UI_TARS_ENDPOINT first.  Only called if steps 1-2 failed.
 *     Returns { strategy:"vision_remote", coords: {x,y}, confidence }.
 *
 *   STEP 4 — Local Vision Server  (llama-server subprocess, offline fallback)
 *     Only called when the remote endpoint is unreachable.
 *     Returns { strategy:"vision_local", coords: {x,y}, confidence }.
 *
 * Cache
 *   Once a (domain, targetDescription, actionType) triple resolves successfully,
 *   ONLY the winning strategy name is stored (e.g. 'dom', 'llm', 'vision_remote').
 *   On a cache hit the router re-runs ONLY that strategy against the current live
 *   page state — no stale elementIds or coordinates are ever reused.
 *   Cache is invalidated after page navigations via invalidateDomain(domain) or
 *   invalidateAll().
 *
 * Audit
 *   Every resolution — hit, miss, fallback — is written to AuditLog with fields:
 *     workflow_id, user_request (targetDescription), strategy, confidence,
 *     domain, cached, elapsed_ms.
 */

const fetch = require('node-fetch');

// ─── Confidence thresholds ───────────────────────────────────────────────────
const DOM_HIGH_CONF   = 0.75; // Return immediately on DOM match
const DOM_MIN_CONF    = 0.40; // Still worth passing to LLM
const VISION_MIN_CONF = 0.30; // Minimum to accept a vision result

// ─── Strategy pipeline order ─────────────────────────────────────────────────
// Used by browser-agent for one-shot retry when post-condition verification fails.
const STRATEGY_ORDER = ['dom', 'llm', 'vision_remote', 'vision_local'];

// ─── Remote endpoint health-check cache ─────────────────────────────────────
// Avoids re-checking the endpoint on every call; TTL = 30 s
const REMOTE_HEALTH_TTL_MS = 30000;
let _remoteHealthCache = { ok: null, checkedAt: 0 };

class GroundingRouter {
  constructor({ browserInteraction, planner, tabManager, getLocalVisionServer, auditLog }) {
    this.browserInteraction   = browserInteraction;
    this.planner              = planner;
    this.tabManager           = tabManager;
    this.getLocalVisionServer = getLocalVisionServer;
    this.auditLog             = auditLog;

    // In-memory cache: Map<cacheKey, { strategy: string, actionType: string }>
    // Stores ONLY the winning strategy name — never raw elementIds or coordinates.
    this._cache = new Map();

    // Fix 1: Per-domain DOM+LLM consecutive failure counter.
    // After DOM_LLM_SKIP_THRESHOLD consecutive failures on a domain, the router
    // skips DOM+LLM for ALL subsequent resolutions on that domain this session
    // and goes straight to vision.
    this._domFailures = new Map(); // domain → consecutive failure count

    this._remoteEndpoint = process.env.UI_TARS_ENDPOINT || 'http://100.107.81.110:11435/v1/chat/completions';
    this._remoteApiKey   = process.env.UI_TARS_API_KEY   || 'dummy';
  }

  // Fix 1/3: Threshold for switching a domain to vision-only mode
  static get DOM_LLM_SKIP_THRESHOLD() { return 2; }

  // Fix 3: Max ms allowed for DOM + LLM stages combined.
  // If elapsed exceeds this before vision is attempted, skip straight to vision.
  static get DOM_LLM_BUDGET_MS() { return 8000; }

  /**
   * Resolve a UI element from a semantic description.
   *
   * @param {string} tabId
   * @param {string} targetDescription
   * @param {object} [pageContext]   Output of PageContextEngine.getContext()
   * @param {string} [actionType]   'click' (default) or 'type' — controls which
   *                                DOM candidates are prioritised in step 1.
   * @param {object} [opts]
   * @param {boolean} [opts.preferVision]  Fix 2: When true, skip DOM+LLM and go
   *                                       straight to vision (remote → local).
   * @returns {Promise<{ strategy, elementId?, coords?, confidence, cached }>}
   */
  async resolveElement(tabId, targetDescription, pageContext, actionType, opts) {
    const t0         = Date.now();
    const actType    = actionType === 'type' ? 'type' : 'click';
    const domain     = this._domainOf(pageContext && pageContext.url ? pageContext.url : '');
    const key        = this._cacheKey(domain, targetDescription, actType);

    // Check vision backend availability before deciding whether to prefer/force vision
    const remoteOk = await this._checkRemoteHealth();
    const lvs = this.getLocalVisionServer && this.getLocalVisionServer();
    const localOk = Boolean(lvs && typeof lvs.isConfigured === 'function' && lvs.isConfigured());
    const visionAvailable = remoteOk || localOk;

    // Fix 1 + Fix 2: determine whether to skip DOM/LLM entirely (only if vision backend exists)
    const domFailCount   = this._domFailures.get(domain) || 0;
    const domainFailing  = domFailCount >= GroundingRouter.DOM_LLM_SKIP_THRESHOLD;
    const preferVision   = visionAvailable && (Boolean(opts && opts.preferVision) || domainFailing);

    if (preferVision) {
      console.log('[GroundingRouter] Skipping DOM+LLM for "' + targetDescription + '" on ' + domain +
        (domainFailing ? ' (domain failure count=' + domFailCount + ')' : ' (preferVision=true)'));
    }

    // ── Cache hit — re-run ONLY the winning strategy live (no stale IDs/coords) ──
    if (!preferVision && this._cache.has(key)) {
      const cached = this._cache.get(key);
      console.log('[GroundingRouter] Cache hit for "' + targetDescription + '" on ' + domain + ' → replaying strategy="' + cached.strategy + '"');
      const fresh = await this._runStrategy(cached.strategy, tabId, targetDescription, actType);
      if (fresh && fresh.strategy !== 'failed') {
        this._log(targetDescription, Object.assign({}, fresh, { cached: true, domain: domain, elapsed_ms: Date.now() - t0 }));
        return Object.assign({}, fresh, { cached: true });
      }
      // Winning strategy no longer works (e.g. element removed) — fall through to full pipeline
      this._cache.delete(key);
      console.warn('[GroundingRouter] Cached strategy "' + cached.strategy + '" failed on replay — re-running full pipeline.');
    }

    let result = null;

    // Fix 3: DOM+LLM internal time budget — if either stage eats more than
    // DOM_LLM_BUDGET_MS combined, fall through to vision immediately.
    const domLlmDeadline = t0 + GroundingRouter.DOM_LLM_BUDGET_MS;

    if (!preferVision) {
      // ── Step 1: DOM semantic match ───────────────────────────────────────
      result = await this._tryDOM(tabId, targetDescription, actType);
      if (result && result.confidence >= DOM_HIGH_CONF) {
        // DOM success — reset failure counter for this domain
        this._domFailures.set(domain, 0);
        console.log('[GroundingRouter] DOM match (conf=' + result.confidence.toFixed(2) + ') for "' + targetDescription + '"');
        return this._finish(key, result, false, targetDescription, domain, t0);
      }

      // Preserve DOM candidates for potential LLM narrowing
      const domCandidates = (result && result.candidates) ? result.candidates : [];

      // Fix 3: check budget before entering LLM step
      if (Date.now() < domLlmDeadline) {
        // ── Step 2: LLM semantic fallback ─────────────────────────────────
        const llmDOM = domCandidates.length > 0 ? domCandidates : await this._readScreen(tabId);
        const llmId  = await this._tryLLM(targetDescription, llmDOM);
        if (llmId) {
          // LLM success — reset failure counter
          this._domFailures.set(domain, 0);
          const r = { strategy: 'llm', elementId: llmId, confidence: 0.70 };
          console.log('[GroundingRouter] LLM fallback resolved "' + targetDescription + '" → elementId="' + llmId + '"');
          return this._finish(key, r, false, targetDescription, domain, t0);
        }
      } else {
        console.warn('[GroundingRouter] DOM+LLM budget exhausted after ' + (Date.now() - t0) + 'ms — skipping LLM, going straight to vision.');
      }

      // Both DOM and LLM failed in this resolution attempt — record 1 failure for the domain
      const newFailCount = (this._domFailures.get(domain) || 0) + 1;
      this._domFailures.set(domain, newFailCount);
      console.warn('[GroundingRouter] DOM+LLM resolution failed for "' + targetDescription + '" on ' + domain +
        ' (failures=' + newFailCount + '/' + GroundingRouter.DOM_LLM_SKIP_THRESHOLD + ')');
    }

    // ── Step 3: Remote UI-TARS vision ─────────────────────────────────────
    if (remoteOk) {
      const screenshot = await this._captureScreenshot(tabId);
      if (screenshot) {
        const vr = await this._tryRemoteVision(targetDescription, screenshot);
        if (vr && vr.confidence >= VISION_MIN_CONF) {
          const r = { strategy: 'vision_remote', coords: { x: vr.x, y: vr.y }, confidence: vr.confidence };
          console.log('[GroundingRouter] Remote vision resolved "' + targetDescription + '" at (' + vr.x + ',' + vr.y + ') conf=' + vr.confidence.toFixed(2));
          return this._finish(key, r, false, targetDescription, domain, t0);
        }
      }
    } else {
      console.warn('[GroundingRouter] Remote UI-TARS endpoint is unreachable — trying local vision.');
    }

    // ── Step 4: Local vision server fallback ──────────────────────────────
    if (lvs && localOk) {
      const screenshot = await this._captureScreenshot(tabId);
      if (screenshot) {
        const vl = await this._tryLocalVision(lvs, targetDescription, screenshot);
        if (vl && vl.confidence >= VISION_MIN_CONF) {
          const r = { strategy: 'vision_local', coords: { x: vl.x, y: vl.y }, confidence: vl.confidence };
          console.log('[GroundingRouter] Local vision resolved "' + targetDescription + '" at (' + vl.x + ',' + vl.y + ') conf=' + vl.confidence.toFixed(2));
          return this._finish(key, r, false, targetDescription, domain, t0);
        }
      }
    }

    // ── All strategies exhausted ───────────────────────────────────────────
    const failed = { strategy: 'failed', confidence: 0, cached: false };
    console.error('[GroundingRouter] All strategies exhausted for "' + targetDescription + '" on tab ' + tabId + '.');
    this._log(targetDescription, Object.assign({}, failed, { domain: domain, elapsed_ms: Date.now() - t0 }));
    return failed;
  }

  /**
   * Re-run a single named strategy against the current live page state.
   * Used on cache hits so we never replay a stale elementId or coordinate.
   *
   * @param {string} strategy  One of 'dom', 'llm', 'vision_remote', 'vision_local'
   * @param {string} tabId
   * @param {string} targetDescription
   * @param {string} actType  'click' | 'type'
   * @returns {Promise<{ strategy, elementId?, coords?, confidence }|null>}
   */
  async _runStrategy(strategy, tabId, targetDescription, actType) {
    if (strategy === 'dom') {
      const r = await this._tryDOM(tabId, targetDescription, actType);
      return (r && r.elementId) ? r : null;
    }
    if (strategy === 'llm') {
      const elements = await this._readScreen(tabId);
      const id = await this._tryLLM(targetDescription, elements);
      return id ? { strategy: 'llm', elementId: id, confidence: 0.70 } : null;
    }
    if (strategy === 'vision_remote') {
      const ok = await this._checkRemoteHealth();
      if (!ok) return null;
      const ss = await this._captureScreenshot(tabId);
      if (!ss) return null;
      const vr = await this._tryRemoteVision(targetDescription, ss);
      return (vr && vr.confidence >= VISION_MIN_CONF)
        ? { strategy: 'vision_remote', coords: { x: vr.x, y: vr.y }, confidence: vr.confidence }
        : null;
    }
    if (strategy === 'vision_local') {
      const lvs = this.getLocalVisionServer && this.getLocalVisionServer();
      if (!lvs) return null;
      const ss = await this._captureScreenshot(tabId);
      if (!ss) return null;
      const vl = await this._tryLocalVision(lvs, targetDescription, ss);
      return (vl && vl.confidence >= VISION_MIN_CONF)
        ? { strategy: 'vision_local', coords: { x: vl.x, y: vl.y }, confidence: vl.confidence }
        : null;
    }
    return null;
  }

  /**
   * Invalidate cached grounding results for a specific domain.
   * Call this after page navigations.
   */
  invalidateDomain(domain) {
    for (const key of this._cache.keys()) {
      if (key.startsWith(domain + '::')) {
        this._cache.delete(key);
      }
    }
  }

  /** Flush the entire cache. */
  invalidateAll() {
    this._cache.clear();
  }

  /**
   * Evict a single cache entry by its constituent parts.
   * Call this when post-condition verification fails so the next resolution
   * attempt does NOT replay the now-suspect cached strategy.
   * @param {string} domain
   * @param {string} targetDescription
   * @param {string} actionType  'click' | 'type'
   */
  invalidateCacheKey(domain, targetDescription, actionType) {
    const key = this._cacheKey(domain, targetDescription, actionType || 'click');
    this._cache.delete(key);
  }

  /**
   * Return the next strategy after currentStrategy in the pipeline order.
   * Returns null if currentStrategy is already the last step.
   * Used by browser-agent for the one-shot retry on verified_failed.
   * @param {string} currentStrategy
   * @returns {string|null}
   */
  getNextStrategy(currentStrategy) {
    const idx = STRATEGY_ORDER.indexOf(currentStrategy);
    if (idx === -1 || idx === STRATEGY_ORDER.length - 1) return null;
    return STRATEGY_ORDER[idx + 1];
  }

  // ─── Step implementations ────────────────────────────────────────────────

  /**
   * Step 1 — DOM semantic scoring.
   * @param {string} tabId
   * @param {string} targetDescription
   * @param {string} actType  'click' | 'type'  — passed to resolveElementLocally
   *                          so it can prefer input elements for type actions.
   */
  async _tryDOM(tabId, targetDescription, actType) {
    const resolveAction = actType === 'type' ? 'browser_type' : 'browser_click';
    try {
      const res = await this.browserInteraction.resolveElementLocally(
        tabId, targetDescription, resolveAction
      );
      if (!res) return null;

      const elementId  = res.elementId;
      const candidates = res.candidates || [];

      if (elementId) {
        const matched = candidates.find(function(c) { return c.id === elementId; }) || {};
        const score = this._scoreCandidate(matched, targetDescription);
        return {
          strategy:   'dom',
          elementId:  elementId,
          confidence: Math.max(0.90, score),
          candidates: candidates,
        };
      }

      if (candidates.length === 0) return null;
      let best = null;
      let bestScore = 0;
      for (let i = 0; i < candidates.length; i++) {
        const score = this._scoreCandidate(candidates[i], targetDescription);
        if (score > bestScore) {
          bestScore = score;
          best = candidates[i];
        }
      }

      if (!best || bestScore < DOM_MIN_CONF) {
        return { strategy: 'dom', elementId: null, confidence: bestScore, candidates: candidates };
      }
      return { strategy: 'dom', elementId: best.id, confidence: bestScore, candidates: candidates };
    } catch (err) {
      console.warn('[GroundingRouter] DOM step failed:', err.message);
      return null;
    }
  }

  _scoreCandidate(candidate, targetDescription) {
    const desc = (targetDescription || '').toLowerCase();

    const rawSurfaces = [
      candidate.text,
      candidate.placeholder,
      candidate.type,
      candidate.tag,
      candidate.href,
    ];
    const surfaces = rawSurfaces.filter(Boolean).map(function(s) { return String(s).toLowerCase(); });

    if (surfaces.length === 0) return 0;

    for (let i = 0; i < surfaces.length; i++) {
      if (surfaces[i] === desc) return 1.0;
    }
    for (let i = 0; i < surfaces.length; i++) {
      if (surfaces[i].includes(desc) || desc.includes(surfaces[i])) return 0.85;
    }

    const stopWords = ['the','a','an','in','on','at','to','for','of','and','or','is','it','this','that','with','by','from','into'];
    const stopSet = {};
    for (let i = 0; i < stopWords.length; i++) stopSet[stopWords[i]] = true;

    const descParts = desc.split(/\W+/);
    const descTokens = {};
    let descTokenCount = 0;
    for (let i = 0; i < descParts.length; i++) {
      const t = descParts[i];
      if (t.length > 1 && !stopSet[t]) {
        descTokens[t] = true;
        descTokenCount++;
      }
    }
    if (descTokenCount === 0) return 0;

    let maxOverlap = 0;
    for (let si = 0; si < surfaces.length; si++) {
      const surfParts = surfaces[si].split(/\W+/);
      const surfTokens = {};
      let surfTokenCount = 0;
      for (let i = 0; i < surfParts.length; i++) {
        const t = surfParts[i];
        if (t.length > 1 && !stopSet[t]) {
          surfTokens[t] = true;
          surfTokenCount++;
        }
      }
      if (surfTokenCount === 0) continue;
      let common = 0;
      for (const tok in descTokens) {
        if (surfTokens[tok]) common++;
      }
      const overlap = common / Math.max(descTokenCount, surfTokenCount);
      if (overlap > maxOverlap) maxOverlap = overlap;
    }

    // ── Fix 3: content-URL href boost ──────────────────────────────────────────
    // When the candidate has an href pointing to a known content-navigation URL
    // pattern AND the description signals navigation intent, boost the score.
    // This makes the DOM step prefer the outermost <a href="/watch?v=..."> on
    // YouTube over inner thumbnail/avatar sub-elements that lack a real href.
    const CONTENT_URL_RE = /\/(watch|article|product|p\/|post\/|item\/|video\/|story\/|reel\/|shorts\/)/i;
    const NAV_INTENT_RE  = /\b(video|result|link|open|article|product|watch|href|first|top|navigate|visit|read|play)\b/i;
    const href = String(candidate.href || '');
    if (href && CONTENT_URL_RE.test(href) && NAV_INTENT_RE.test(desc)) {
      maxOverlap = Math.max(maxOverlap, 0.85);
    }

    return maxOverlap;
  }

  async _tryLLM(targetDescription, compactDOM) {
    try {
      if (!compactDOM || compactDOM.length === 0) return null;
      const elementId = await this.planner.resolveElementFallback(targetDescription, compactDOM);
      return elementId || null;
    } catch (err) {
      console.warn('[GroundingRouter] LLM fallback failed:', err.message);
      return null;
    }
  }

  async _tryRemoteVision(targetDescription, screenshotBase64) {
    const base64Data = screenshotBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
    const prompt = 'You are UI-TARS, a GUI visual grounding assistant.\nTarget: "' + targetDescription + '"\nReturn ONLY a JSON object: {"action":"click","x":number,"y":number,"confidence":number}';

    try {
      const controller = new AbortController();
      const timeoutId  = setTimeout(function() { controller.abort(); }, 8000);
      const response = await fetch(this._remoteEndpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Bearer ' + this._remoteApiKey,
        },
        body: JSON.stringify({
          model: 'ui-tars-7b',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: 'data:image/png;base64,' + base64Data } },
            ],
          }],
          temperature:     0.1,
          max_tokens:      100,
          response_format: { type: 'json_object' },
        }),
      });
      clearTimeout(timeoutId);

      if (!response.ok) return null;
      const data    = await response.json();
      const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ? data.choices[0].message.content : '{}';
      const parsed  = this._parseJSON(content);
      if (parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
        return { x: parsed.x, y: parsed.y, confidence: parsed.confidence != null ? parsed.confidence : 0.80 };
      }
      return null;
    } catch (err) {
      console.warn('[GroundingRouter] Remote vision error:', err.message);
      return null;
    }
  }

  async _tryLocalVision(lvs, targetDescription, screenshotBase64) {
    try {
      const result = await lvs.infer(screenshotBase64, targetDescription);
      if (!result) return null;
      if (Number.isFinite(result.x) && Number.isFinite(result.y)) {
        return { x: result.x, y: result.y, confidence: result.confidence != null ? result.confidence : 0.60 };
      }
      return null;
    } catch (err) {
      console.warn('[GroundingRouter] Local vision error:', err.message);
      return null;
    }
  }

  async _readScreen(tabId) {
    try {
      const screen = await this.browserInteraction.readScreen(tabId);
      return (screen && screen.elements) ? screen.elements : [];
    } catch (e) {
      return [];
    }
  }

  async _captureScreenshot(tabId) {
    try {
      return await this.tabManager.captureScreenshot(tabId);
    } catch (e) {
      return null;
    }
  }

  /**
   * Check whether the remote UI-TARS server is reachable.
   *
   * Strategy (two-phase, 2 s timeout each, 30 s TTL):
   *   Phase 1 — GET {base}/health
   *     • response.ok → reachable.
   *     • non-ok HTTP (e.g. 404/405, server is up but exposes no /health route)
   *       → fall through to phase 2.
   *     • fetch throws (connection refused / timeout) → unreachable, cache false.
   *
   *   Phase 2 — POST to the actual completions endpoint with a 1×1 blank PNG
   *     and max_tokens=1.  Any valid HTTP response (even an error about the
   *     tiny image) means the server is up and reachable.
   */
  async _checkRemoteHealth() {
    const now = Date.now();
    if (now - _remoteHealthCache.checkedAt < REMOTE_HEALTH_TTL_MS && _remoteHealthCache.ok !== null) {
      return _remoteHealthCache.ok;
    }

    // ── Phase 1: try /health ──────────────────────────────────────────────
    const base = this._remoteEndpoint.replace(/\/v1\/chat\/completions.*$/, '');
    let healthEndpointExists = false;
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(function() { ctrl.abort(); }, 2000);
      const res  = await fetch(base + '/health', { method: 'GET', signal: ctrl.signal });
      clearTimeout(tid);
      if (res.ok) {
        // /health exists and returned 200 — definitely reachable
        _remoteHealthCache = { ok: true, checkedAt: now };
        return true;
      }
      // Got an HTTP response (server is up) but /health returned a non-2xx
      // status — server may not expose this route; move to phase 2 to confirm.
      healthEndpointExists = false;
    } catch (connErr) {
      // fetch threw — server is not reachable at all
      _remoteHealthCache = { ok: false, checkedAt: now };
      return false;
    }

    // ── Phase 2: cheap probe to actual completions endpoint ───────────────
    // 1×1 transparent PNG (smallest valid base64-encoded PNG)
    const BLANK_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    try {
      const ctrl2 = new AbortController();
      const tid2  = setTimeout(function() { ctrl2.abort(); }, 2000);
      const res2  = await fetch(this._remoteEndpoint, {
        method: 'POST',
        signal: ctrl2.signal,
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Bearer ' + this._remoteApiKey,
        },
        body: JSON.stringify({
          model: 'ui-tars-7b',
          max_tokens: 1,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: 'ping' },
              { type: 'image_url', image_url: { url: 'data:image/png;base64,' + BLANK_PNG } },
            ],
          }],
        }),
      });
      clearTimeout(tid2);
      // Any HTTP response (200, 400, 422, 500…) means the server is listening
      _remoteHealthCache = { ok: true, checkedAt: now };
      return true;
    } catch (e) {
      _remoteHealthCache = { ok: false, checkedAt: now };
      return false;
    }
  }

  _finish(key, result, wasCached, targetDescription, domain, t0) {
    if (!wasCached && result.strategy !== 'failed') {
      // Store ONLY the winning strategy name — never raw elementIds or coordinates.
      // Cache hits re-run this strategy live to get fresh references each time.
      this._cache.set(key, { strategy: result.strategy });
    }
    const out = Object.assign({}, result, { cached: wasCached });
    this._log(targetDescription, Object.assign({}, out, { domain: domain, elapsed_ms: Date.now() - t0 }));
    return out;
  }

  _log(targetDescription, meta) {
    if (!this.auditLog) return;
    const self = this;
    Promise.resolve().then(function() {
      return self.auditLog.logAction && self.auditLog.logAction(
        { name: 'grounding_resolve' },
        { taskId: 'grounding', goal: 'Resolve element: "' + targetDescription + '"' },
        {
          success:  meta.strategy !== 'failed',
          strategy: meta.strategy,
          details: {
            targetDescription: targetDescription,
            strategy:          meta.strategy,
            confidence:        meta.confidence,
            cached:            meta.cached,
            domain:            meta.domain,
            elapsed_ms:        meta.elapsed_ms,
          },
        }
      );
    }).catch(function() {});
  }

  _domainOf(url) {
    try {
      return new URL(url).hostname || 'unknown';
    } catch (e) {
      return 'unknown';
    }
  }

  _cacheKey(domain, targetDescription, actionType) {
    // Include actionType so 'click' and 'type' on the same element get separate cache entries
    return domain + '::' + (actionType || 'click') + '::' + (targetDescription || '').toLowerCase().trim();
  }

  _parseJSON(text) {
    try {
      const clean = (text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
      const match = clean.match(/\{[\s\S]*\}/);
      return match ? JSON.parse(match[0]) : null;
    } catch (e) {
      return null;
    }
  }
}

module.exports = GroundingRouter;
