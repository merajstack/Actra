/**
 * Actra AI — Task Manager
 *
 * Manages the lifecycle of AI workflow runs.
 *
 * Full state machine:
 *   queued → understanding → planning → gathering → analyzing
 *   → preparing → waiting_approval → executing → verifying
 *   → logging → completed
 *
 * Error paths:
 *   any state → failed
 *   waiting_approval → rejected (user explicitly rejects)
 *   any state → cancelled
 */

const EventEmitter = require('events');

class TaskManager extends EventEmitter {
  constructor() {
    super();
    this.tasks = new Map();
  }

  createTask(goal, agentId = 'default') {
    const id = 'task_' + Date.now() + Math.random().toString(36).substr(2, 9);
    const task = {
      id,
      goal,
      agentId,
      status: 'queued',
      progress: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      steps: [],
      outputs: null,
      error: null,
      understanding: null,
    };

    this.tasks.set(id, task);
    this._notifyUpdate(task);
    return task;
  }

  updateTaskStatus(id, status, details = {}) {
    const task = this.tasks.get(id);
    if (!task) return false;
    if (task.status === 'cancelled' && status !== 'cancelled') return false;

    task.status = status;
    task.updatedAt = Date.now();

    if (details.progress  !== undefined) task.progress      = details.progress;
    if (details.outputs   !== undefined) task.outputs       = details.outputs;
    if (details.error     !== undefined) task.error         = details.error;
    if (details.understanding !== undefined) task.understanding = details.understanding;

    this._notifyUpdate(task);
    return true;
  }

  addStep(id, description, status = 'pending', phase = '') {
    const task = this.tasks.get(id);
    if (!task) return null;

    const stepId = 'step_' + Date.now() + Math.random().toString(36).substr(2, 5);
    const step = { id: stepId, description, status, phase };
    task.steps.push(step);

    this._notifyUpdate(task);
    return step;
  }

  updateStep(id, stepId, status, output = null) {
    const task = this.tasks.get(id);
    if (!task) return false;

    const step = task.steps.find(s => s.id === stepId);
    if (!step) return false;

    step.status = status;
    if (output !== null) step.output = typeof output === 'string' ? output : JSON.stringify(output);
    task.updatedAt = Date.now();

    this._notifyUpdate(task);
    return true;
  }

  getTask(id) {
    return this.tasks.get(id);
  }

  getAllActiveTasks() {
    return Array.from(this.tasks.values()).filter(
      t => !['completed', 'failed', 'cancelled', 'rejected'].includes(t.status)
    );
  }

  cancelAllActiveTasks() {
    const cancelled = [];
    for (const task of this.getAllActiveTasks()) {
      this.updateTaskStatus(task.id, 'cancelled');
      cancelled.push(task.id);
    }
    return { success: true, cancelled };
  }

  getAllTasks() {
    return Array.from(this.tasks.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50);
  }

  _notifyUpdate(task) {
    this.emit('task-updated', task);
    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
      global.mainWindow.webContents.send('ai:task-update', task);
    }
  }
}

module.exports = TaskManager;
