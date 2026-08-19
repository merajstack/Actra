/**
 * Actra AI — Audit Log
 *
 * Stores a full structured record of every meaningful agent workflow
 * per the spec fields: workflow_id, user_request, timestamp, agent_plan,
 * data_sources_used, actions_proposed, approval_required, approval_status,
 * approved_by, execution_status, execution_result, error.
 */
const supabase = require('../supabase');

class AuditLog {
  async createEntry(workflowId, userRequest) {
    const id = 'log_' + Date.now() + Math.random().toString(36).substr(2, 6);
    const entry = {
      id,
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

    await supabase.from('audit_logs').insert([{ id, log_data: entry }]);
    return id;
  }

  async updateEntry(entryId, updates) {
    const { data } = await supabase.from('audit_logs').select('log_data').eq('id', entryId).single();
    if (!data) return;
    
    const updated = { ...data.log_data, ...updates };
    await supabase.from('audit_logs').update({ log_data: updated }).eq('id', entryId);
  }

  async logAction(action, context, result) {
    const id = 'log_' + Date.now();
    const entry = {
      id,
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
    };
    await supabase.from('audit_logs').insert([{ id, log_data: entry }]);
  }

  async getLogs(limit = 100) {
    const { data } = await supabase.from('audit_logs').select('log_data').limit(limit).order('id', { ascending: false });
    return data ? data.map(d => d.log_data) : [];
  }

  async clearLogs() {
    await supabase.from('audit_logs').delete().neq('id', '0');
  }
}

module.exports = AuditLog;
