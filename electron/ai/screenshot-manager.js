const { ipcMain } = require('electron');

class ScreenshotManager {
  constructor(tabManager, taskManager) {
    this.tabManager = tabManager;
    this.taskManager = taskManager;
  }

  async captureForUITars(tabId) {
    console.log(`[ScreenshotManager] Capturing fresh viewport for tab ${tabId}...`);
    const screenshotBase64 = await this.tabManager.captureScreenshot(tabId);
    if (!screenshotBase64) {
      throw new Error('Failed to capture screenshot.');
    }
    return screenshotBase64;
  }

  displayInAgentUI(taskId, stepId, screenshotBase64) {
    // We attach the screenshot to a specific step in the task manager.
    // The task manager will broadcast this to the UI.
    const task = this.taskManager.getTask(taskId);
    if (task) {
      const step = task.steps.find(s => s.id === stepId);
      if (step) {
        step.screenshot = screenshotBase64;
        this.taskManager.updateStep(taskId, stepId, step.status, step.output); // triggers notifyUpdate
      }
    }
  }
}

module.exports = ScreenshotManager;
