/**
 * Actra AI — Audit Log
 *
 * Stores a full structured record of every meaningful agent workflow
 * per the spec fields: workflow_id, user_request, timestamp, agent_plan,
 * data_sources_used, actions_proposed, approval_required, approval_status,
 * approved_by, execution_status, execution_result, error.
 */
const { default: Store } = require('electron-store');

class AuditLog {
  constructor() {
    this.store = new Store({ name: 'ai-audit-log' });
  }

  /**
   * Create a new audit entry for a workflow run.
   * Call this at the start of a workflow, then update with updateEntry().
   */
  createEntry(workflowId, userRequest) {
    const entry = {
      id: 'log_' + Date.now() + Math.random().toString(36).substr(2, 6),
      workflow_id: workflowId,
      user_request: userRequest,
      timestamp: Date.now(),
      agent_plan: '',
      data_sources_used: [],
      actions_proposed: [],
      approval_required: false,
      approval_status: 'not_required',
      approved_by: null,
      execution_status: 'not_executed',
      execution_result: null,
      error: null,
    };

    const logs = this.store.get('logs', []);
    logs.unshift(entry);
    if (logs.length > 1000) logs.length = 1000;
    this.store.set('logs', logs);

    return entry.id;
  }

  /**
   * Update fields on an existing audit entry.
   * @param {string} entryId - The ID returned by createEntry
   * @param {Partial<AuditEntry>} updates
   */
  updateEntry(entryId, updates) {
    const logs = this.store.get('logs', []);
    const idx = logs.findIndex(l => l.id === entryId);
    if (idx === -1) return;

    Object.assign(logs[idx], updates);
    this.store.set('logs', logs);
  }

  /**
   * Convenience: log a completed action (legacy single-shot API).
   */
  logAction(action, context, result) {
    const logs = this.store.get('logs', []);
    logs.unshift({
      id: 'log_' + Date.now(),
      workflow_id: context?.taskId || 'unknown',
      user_request: context?.goal || action.name,
      timestamp: Date.now(),
      agent_plan: '',
      data_sources_used: [],
      actions_proposed: [action.name],
      approval_required: false,
      approval_status: 'auto_approved',
      approved_by: null,
      execution_status: result?.success !== false ? 'success' : 'failed',
      execution_result: typeof result === 'string' ? result : JSON.stringify(result),
      error: result?.error || null,
    });
    if (logs.length > 1000) logs.length = 1000;
    this.store.set('logs', logs);
  }

  getLogs(limit = 100) {
    return this.store.get('logs', []).slice(0, limit);
  }

  clearLogs() {
    this.store.set('logs', []);
  }
}

module.exports = AuditLog;
