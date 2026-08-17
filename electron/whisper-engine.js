/**
 * Whisper Engine - Runs Whisper speech-to-text in the Electron main process.
 * Uses @xenova/transformers with the Xenova/whisper-tiny.en model.
 */

let pipelineFn = null;
let transcriber = null;
let isLoading = false;
let isReady = false;

async function ensureLoaded() {
  if (transcriber) return transcriber;
  if (isLoading) {
    // Wait for existing load to finish
    while (isLoading) {
      await new Promise(r => setTimeout(r, 100));
    }
    return transcriber;
  }

  isLoading = true;
  try {
    console.log('[WhisperEngine] Loading @xenova/transformers...');
    const mod = await import('@xenova/transformers');
    pipelineFn = mod.pipeline;
    // Disable local model check - always fetch from HuggingFace Hub
    if (mod.env) {
      mod.env.allowLocalModels = false;
    }
    
    console.log('[WhisperEngine] Downloading Xenova/whisper-tiny.en model (first time only)...');
    transcriber = await pipelineFn('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
      quantized: true,
    });
    isReady = true;
    console.log('[WhisperEngine] Model loaded and ready!');
    return transcriber;
  } catch (err) {
    console.error('[WhisperEngine] Failed to load model:', err);
    throw err;
  } finally {
    isLoading = false;
  }
}

/**
 * Transcribe a Float32Array of audio samples at 16kHz.
 * @param {Float32Array} audioData - The audio samples
 * @returns {Promise<string>} The transcribed text
 */
async function transcribe(audioData) {
  const t = await ensureLoaded();
  
  console.log(`[WhisperEngine] Transcribing ${audioData.length} samples (${(audioData.length / 16000).toFixed(1)}s of audio)...`);
  
  const result = await t(audioData, {
    chunk_length_s: 30,
    stride_length_s: 5,
    language: 'english',
    task: 'transcribe',
  });
  
  const text = result.text ? result.text.trim() : '';
  console.log(`[WhisperEngine] Transcription result: "${text}"`);
  return text;
}

function getStatus() {
  return { isReady, isLoading };
}

module.exports = { ensureLoaded, transcribe, getStatus };
