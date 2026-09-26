const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { EventEmitter } = require('events');
const { execFile } = require('child_process');

const MODEL_FILES = [
  {
    id: 'ui-tars-weights',
    name: 'UI-TARS 2B model',
    filename: 'UI-TARS-2B-SFT-Q4_K_M.gguf',
    url: 'https://huggingface.co/bartowski/UI-TARS-2B-SFT-GGUF/resolve/main/UI-TARS-2B-SFT-Q4_K_M.gguf?download=true',
    minBytes: 1024 * 1024 * 1024,
  },
  {
    id: 'ui-tars-projector',
    name: 'UI-TARS vision projector',
    filename: 'mmproj-UI-TARS-2B-SFT-f16.gguf',
    url: 'https://huggingface.co/bartowski/UI-TARS-2B-SFT-GGUF/resolve/main/mmproj-UI-TARS-2B-SFT-f16.gguf?download=true',
    minBytes: 1200 * 1024 * 1024,
  },
];

const RUNTIME = {
  id: 'ui-tars-runtime',
  name: 'UI-TARS vision runtime',
  filename: process.platform === 'win32' ? 'llama-server.exe' : 'llama-server',
  archive: process.platform === 'win32'
    ? 'llama-b10488-bin-win-cpu-x64.zip'
    : 'llama-b10488-bin-macos-arm64.tar.gz',
  url: process.platform === 'win32'
    ? 'https://github.com/ggml-org/llama.cpp/releases/download/b10488/llama-b10488-bin-win-cpu-x64.zip'
    : 'https://github.com/ggml-org/llama.cpp/releases/download/b10488/llama-b10488-bin-macos-arm64.tar.gz',
  minBytes: 1024 * 1024,
};

class LocalModelManager extends EventEmitter {
  constructor() {
    super();
    this.modelsDir = path.join(app.getPath('appData'), 'Actra dependencies');
    this.runtimeDir = path.join(this.modelsDir, 'runtime');
    this.migrateLegacyModels();
    this.downloading = false;
    this.status = null;
  }

  migrateLegacyModels() {
    const legacyDir = path.join(app.getPath('userData'), 'models', 'ui-tars');
    if (!fs.existsSync(legacyDir)) return;
    fs.mkdirSync(this.modelsDir, { recursive: true });
    for (const entry of fs.readdirSync(legacyDir)) {
      const destination = path.join(this.modelsDir, entry);
      if (!fs.existsSync(destination)) {
        fs.cpSync(path.join(legacyDir, entry), destination, { recursive: true, force: false });
      }
    }
    fs.rmSync(legacyDir, { recursive: true, force: true });
  }

  getModelPaths() {
    return {
      ...Object.fromEntries(MODEL_FILES.map(file => [file.id, path.join(this.modelsDir, file.filename)])),
      [RUNTIME.id]: path.join(this.runtimeDir, process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'),
    };
  }

  getStatus() {
    const paths = this.getModelPaths();
    const files = [...MODEL_FILES, RUNTIME].map(file => {
      const filePath = paths[file.id];
      let downloadedBytes = 0;
      try { downloadedBytes = fs.statSync(filePath).size; } catch (error) {}
      return { ...file, downloadedBytes, installed: file.id === RUNTIME.id
        ? downloadedBytes >= file.minBytes
        : downloadedBytes >= file.minBytes };
    });
    return {
      ready: files.every(file => file.installed),
      downloading: this.downloading,
      files,
      modelsDir: this.modelsDir,
      ...this.status,
    };
  }

  emitStatus(status = {}) {
    this.status = status;
    this.emit('status', this.getStatus());
    return this.getStatus();
  }

  async downloadAll() {
    if (this.downloading) return this.getStatus();
    this.downloading = true;
    this.emitStatus({ phase: 'starting', percent: 0, error: null });
    fs.mkdirSync(this.modelsDir, { recursive: true });

    try {
      if (!this.getStatus().files.find(item => item.id === RUNTIME.id)?.installed) {
        await this.downloadRuntime();
      }
      for (let index = 0; index < MODEL_FILES.length; index += 1) {
        const file = MODEL_FILES[index];
        const targetPath = path.join(this.modelsDir, file.filename);
        if (this.getStatus().files.find(item => item.id === file.id)?.installed) continue;
        await this.downloadFile(file, targetPath, index + 1, MODEL_FILES.length + 1);
      }
      this.downloading = false;
      return this.emitStatus({ phase: 'complete', percent: 100, error: null });
    } catch (error) {
      this.downloading = false;
      return this.emitStatus({ phase: 'error', error: error.message });
    }
  }

  async downloadRuntime() {
    fs.mkdirSync(this.runtimeDir, { recursive: true });
    const archivePath = path.join(this.runtimeDir, RUNTIME.archive);
    await this.downloadFile(RUNTIME, archivePath, 0, MODEL_FILES.length + 1, true);
    await new Promise((resolve, reject) => {
      const args = process.platform === 'win32'
        ? ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${this.runtimeDir.replace(/'/g, "''")}' -Force`]
        : ['-xzf', archivePath, '-C', this.runtimeDir];
      const command = process.platform === 'win32' ? 'powershell.exe' : 'tar';
      execFile(command, args, error => error ? reject(error) : resolve());
    });
    const runtimePath = this.getModelPaths()[RUNTIME.id];
    if (!fs.existsSync(runtimePath)) {
      const found = fs.readdirSync(this.runtimeDir, { recursive: true }).find(file => String(file).endsWith(process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'));
      if (found) {
        const sourceDir = path.dirname(path.join(this.runtimeDir, found));
        for (const entry of fs.readdirSync(sourceDir)) {
          fs.cpSync(path.join(sourceDir, entry), path.join(this.runtimeDir, entry), { recursive: true });
        }
      }
    }
    fs.unlinkSync(archivePath);
  }

  downloadFile(file, targetPath, index, totalFiles, isArchive = false) {
    const partPath = `${targetPath}.part`;
    return new Promise((resolve, reject) => {
      const request = (url) => {
        const requestHandle = https.get(url, response => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
          response.resume();
          request(new URL(response.headers.location, url).toString());
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          try { fs.unlinkSync(partPath); } catch (error) {}
          reject(new Error(`Model download failed (${response.statusCode})`));
          return;
        }

        const totalBytes = Number(response.headers['content-length']) || 0;
        let receivedBytes = 0;
        const output = fs.createWriteStream(partPath);
        response.on('data', chunk => {
          receivedBytes += chunk.length;
          const filePercent = totalBytes ? receivedBytes / totalBytes : 0;
          const percent = Math.round(((index + filePercent) / totalFiles) * 100);
          this.emitStatus({ phase: 'downloading', file: file.id, percent, receivedBytes, totalBytes, error: null });
        });
        response.pipe(output);
        response.on('error', error => {
          output.destroy(error);
        });
        output.on('finish', () => output.close(() => {
          try {
            const downloadedSize = fs.statSync(partPath).size;
            if (!isArchive && downloadedSize < file.minBytes) {
              fs.unlinkSync(partPath);
              reject(new Error(`${file.name} download was incomplete.`));
              return;
            }
            fs.renameSync(partPath, targetPath);
            resolve();
          } catch (error) {
            reject(error);
          }
        }));
        output.on('error', error => {
          output.close();
          try { fs.unlinkSync(partPath); } catch (cleanupError) {}
          reject(error);
        });
        });
        requestHandle.on('error', error => {
          try { fs.unlinkSync(partPath); } catch (cleanupError) {}
          reject(error);
        });
        return requestHandle;
      };
      request(file.url);
    });
  }
}

module.exports = { LocalModelManager, MODEL_FILES };
