/**
 * Actra AI — Approval Engine
 *
 * Classifies risk and gates sensitive actions behind human approval.
 *
 * States: pending → approved | rejected | edited
 *
 * Safety rules enforced here:
 * - NO auto-approve timeout (user must explicitly decide)
 * - NO retrying rejected actions
 * - EDIT re-evaluates from scratch with updated args
 */

class ApprovalEngine {
  constructor(policyEngine) {
    this.policyEngine = policyEngine;
    /** @type {Map<string, { action, context, resolve, taskId }>} */
    this.pendingApprovals = new Map();
  }

  /**
   * Evaluate whether an action requires approval.
   * Returns { approved: bool, riskLevel: number, reason?: string }
   */
  async evaluateAction(action, context) {
    const policyResult = this.policyEngine
      ? this.policyEngine.evaluate(action)
      : 'require_approval';

    const riskLevel = this.policyEngine
      ? this.policyEngine.getRiskLevel(action)
      : 2;

    console.log(`[ApprovalEngine] ${action.name} → policy: ${policyResult}, risk: ${riskLevel}`);

    if (policyResult === 'deny') {
      return { approved: false, riskLevel, reason: `Action "${action.name}" is permanently denied by security policy.` };
    }

    if (policyResult === 'require_approval') {
      return await this._requestHumanApproval(action, context, riskLevel);
    }

    // allow
    return { approved: true, riskLevel };
  }

  /**
   * Pause the workflow and ask the user for a decision via the SidePanel.
   * The returned promise only resolves when the user explicitly acts.
   */
  _requestHumanApproval(action, context, riskLevel) {
    return new Promise((resolve) => {
      const approvalId = 'app_' + Date.now() + Math.random().toString(36).substr(2, 9);

      this.pendingApprovals.set(approvalId, {
        action,
        context,
        riskLevel,
        resolve: (result) => resolve({ ...result, approvalId, riskLevel }),
      });

      if (global.mainWindow && !global.mainWindow.isDestroyed()) {
        // Build rich approval payload for the UI
        const payload = this._buildApprovalPayload(approvalId, action, context, riskLevel);
        global.mainWindow.webContents.send('ai:require-approval', payload);
        global.mainWindow.webContents.send('ai:open-side-panel');
      }

      // NOTE: No auto-approve timeout — user MUST respond explicitly.
    });
  }

  _buildApprovalPayload(approvalId, action, context, riskLevel) {
    const args = action.args || {};

    let summary = `The AI wants to execute: ${action.name}`;
    let generatedContent = null;
    let recipients = [];
    let consequences = null;

    if (action.name === 'send_email') {
      summary = `Send email to ${args.to}`;
      generatedContent = `Subject: ${args.subject}\n\n${args.body}`;
      recipients = [args.to].filter(Boolean);
      consequences = 'This will send an external email. It cannot be undone.';
    } else if (action.name === 'write_sheet' || action.name === 'update_sheet') {
      summary = `Update Google Sheet "${args.spreadsheetId}"`;
      generatedContent = `Range: ${args.range}\nValues: ${JSON.stringify(args.values)}`;
      consequences = 'This will modify spreadsheet data.';
    } else if (action.name === 'create_calendar_event') {
      summary = `Create calendar event: "${args.title}"`;
      generatedContent = `Title: ${args.title}\nDate: ${args.startDateTime}\nAttendees: ${(args.attendeeEmails || []).join(', ')}`;
      recipients = args.attendeeEmails || [];
      consequences = 'This will create a calendar event and may send invitations to attendees.';
    } else if (action.name === 'create_doc') {
      summary = `Create Google Doc: "${args.title}"`;
      generatedContent = args.content ? args.content.slice(0, 500) + (args.content.length > 500 ? '...' : '') : '';
    }

    return {
      id: approvalId,
      taskId: context?.taskId,
      action,
      context,
      summary,
      generatedContent,
      recipients,
      riskLevel,
      reason: context?.reason || 'AI agent requested this action as part of your workflow.',
      consequences,
    };
  }

  /**
   * User approved the action.
   */
  resolveApproval(approvalId, approved) {
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending) return false;

    pending.resolve({ approved });
    this.pendingApprovals.delete(approvalId);
    return true;
  }

  /**
   * User edited the action args and wants to re-approve with modifications.
   * Updates the pending action's args and resolves with the new args.
   */
  editAndApprove(approvalId, newArgs) {
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending) return false;

    // Merge edits into the action
    const updatedAction = { ...pending.action, args: { ...pending.action.args, ...newArgs } };
    pending.resolve({ approved: true, editedArgs: newArgs, action: updatedAction });
    this.pendingApprovals.delete(approvalId);
    return true;
  }

  hasPending(approvalId) {
    return this.pendingApprovals.has(approvalId);
  }
}

module.exports = ApprovalEngine;
