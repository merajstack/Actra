const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');

class LocalVisionServer {
  constructor({ runtimePath, modelPath, projectorPath }) {
    this.runtimePath = runtimePath;
    this.modelPath = modelPath;
    this.projectorPath = projectorPath;
    this.process = null;
    this.port = 28473;
    this._startPromise = null;
  }

  isConfigured() {
    return Boolean(
      this.runtimePath &&
      this.modelPath &&
      this.projectorPath &&
      fs.existsSync(this.runtimePath) &&
      fs.existsSync(this.modelPath)
    );
  }

  prewarm() {
    if (!this.isConfigured()) return;
    if (this._startPromise || this.process) return;
    this.start().catch(err => {
      console.warn('[LocalVisionServer] Prewarm failed or timed out:', err.message);
    });
  }

  async start() {
    if (this.process && await this.isReady()) return;
    if (this._startPromise) return this._startPromise;

    if (!this.isConfigured()) throw new Error('Local UI-TARS vision runtime or model files are not installed.');

    this._startPromise = (async () => {
      try {
        if (!this.process) {
          this.process = spawn(this.runtimePath, [
            '--model', this.modelPath,
            '--mmproj', this.projectorPath,
            '--host', '127.0.0.1',
            '--port', String(this.port),
            '--ctx-size', '8192',
            '--n-gpu-layers', '999',
          ], { windowsHide: true, stdio: 'ignore' });
          this.process.once('exit', () => {
            this.process = null;
            this._startPromise = null;
          });
        }
        for (let attempt = 0; attempt < 20; attempt += 1) {
          if (!this.process) throw new Error('UI-TARS vision runtime exited immediately.');
          if (await this.isReady()) return;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        throw new Error('UI-TARS vision runtime did not start.');
      } finally {
        this._startPromise = null;
      }
    })();

    return this._startPromise;
  }

  isReady() {
    return new Promise(resolve => {
      const request = http.get(`http://127.0.0.1:${this.port}/health`, response => {
        response.resume();
        resolve(response.statusCode === 200);
      });
      request.on('error', () => resolve(false));
      request.setTimeout(500, () => { request.destroy(); resolve(false); });
    });
  }

  async infer(screenshotBase64, intentQuery) {
    await this.start();
    const image = screenshotBase64.replace(/^data:image\/[^;]+;base64,/, '');
    const response = await fetch(`http://127.0.0.1:${this.port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'ui-tars',
        temperature: 0.1,
        max_tokens: 200,
        messages: [{ role: 'user', content: [
          { type: 'text', text: `You are UI-TARS. ${intentQuery}\nReturn only JSON: {"action":"click|type|scroll|done","x":number,"y":number,"text":string,"direction":"up|down","amount":number,"confidence":number}` },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${image}` } },
        ] }],
      }),
    });
    if (!response.ok) throw new Error(`UI-TARS server returned ${response.status}`);
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('UI-TARS returned invalid action JSON.');
    return JSON.parse(match[0]);
  }

  stop() {
    if (this.process) this.process.kill();
    this.process = null;
    this._startPromise = null;
  }
}

module.exports = { LocalVisionServer };
