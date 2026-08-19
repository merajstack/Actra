/**
 * Actra AI — Policy Engine
 *
 * Enforces permissions and restrictions on ALL AI actions.
 *
 * Risk classification:
 *   allow           → Read-only, summarize, analyze — no approval needed
 *   require_approval → External communication, data mutation — needs human sign-off
 *   deny            → Destructive / financial actions — always blocked
 */

class PolicyEngine {
  constructor() {
    this.policies = [
      // ── ALLOW (read / analyze) ─────────────────────────────────────────
      { action: 'search_gmail',           effect: 'allow' },
      { action: 'read_gmail_thread',      effect: 'allow' },
      { action: 'get_calendar_events',    effect: 'allow' },
      { action: 'read_sheet',             effect: 'allow' },
      { action: 'search_drive',           effect: 'allow' },
      { action: 'read',                   effect: 'allow' },
      { action: 'search',                 effect: 'allow' },
      { action: 'extract',                effect: 'allow' },
      { action: 'summarize',              effect: 'allow' },
      { action: 'analyze',                effect: 'allow' },
      { action: 'draft',                  effect: 'allow' },
      { action: 'browser_read_screen',    effect: 'allow' },
      { action: 'browser_extract_page_text', effect: 'allow' },
      { action: 'browser_scroll',         effect: 'allow' },
      { action: 'browser_navigate',       effect: 'allow' },

      // ── REQUIRE APPROVAL (external / irreversible) ─────────────────────
      { action: 'send_email',             effect: 'require_approval' },
      { action: 'write_sheet',            effect: 'require_approval' },
      { action: 'update_sheet',           effect: 'require_approval' },
      { action: 'create_doc',             effect: 'require_approval' },
      { action: 'create_calendar_event',  effect: 'require_approval' },
      { action: 'update_calendar_event',  effect: 'require_approval' },
      { action: 'delete_calendar_event',  effect: 'require_approval' },
      { action: 'share_drive_file',       effect: 'require_approval' },
      { action: 'change_permissions',     effect: 'require_approval' },
      { action: 'click',                  effect: 'require_approval' },
      { action: 'type',                   effect: 'require_approval' },
      { action: 'fill_form',              effect: 'require_approval' },
      { action: 'update',                 effect: 'require_approval' },
      { action: 'save',                   effect: 'require_approval' },

      // ── DENY (destructive / financial) ─────────────────────────────────
      { action: 'delete',                 effect: 'deny' },
      { action: 'purchase',               effect: 'deny' },
      { action: 'buy',                    effect: 'deny' },
      { action: 'pay',                    effect: 'deny' },
    ];
  }

  /**
   * Evaluate an action against the policy table.
   * Matched by substring — so 'send_email' matches action name 'send_email'.
   * @returns {'allow' | 'deny' | 'require_approval'}
   */
  evaluate(action) {
    const name = (action.name || '').toLowerCase();

    // Auto-allow all read-only browser tools for autonomous UI navigation
    if (name.startsWith('browser_')) return 'allow';

    // Deny takes priority
    for (const p of this.policies) {
      if (p.effect === 'deny' && name.includes(p.action)) return 'deny';
    }

    // Then require_approval
    for (const p of this.policies) {
      if (p.effect === 'require_approval' && name.includes(p.action)) return 'require_approval';
    }

    // Then explicit allow
    for (const p of this.policies) {
      if (p.effect === 'allow' && name.includes(p.action)) return 'allow';
    }

    // Default: require approval for unknown actions (safe default)
    return 'require_approval';
  }

  /**
   * Classify a numeric risk level for UI display.
   * 0 = safe, 1 = medium, 2 = high
   */
  getRiskLevel(action) {
    const result = this.evaluate(action);
    if (result === 'deny') return 2;
    if (result === 'require_approval') return 2;
    return 0;
  }
}

module.exports = PolicyEngine;
