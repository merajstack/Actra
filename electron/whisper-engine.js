const supabase = require('./supabase');

let isLoading = false;
let isReady = true;

async function getGroqApiKey() {
  try {
    const { default: Store } = await import('electron-store');
    const localStore = new Store({ name: 'config', projectName: 'Actra' });
    const localKey = localStore.get('groqKey');
    if (localKey && typeof localKey === 'string' && localKey.trim().length > 5) return localKey.trim();
  } catch (e) {}
  try {
    const { data } = await supabase.from('settings').select('value').eq('key', 'groqKey').single();
    if (data?.value && typeof data.value === 'string' && data.value.trim().length > 5) return data.value.trim();
  } catch (e) {}
  return null;
}

async function ensureLoaded() {
  const apiKey = await getGroqApiKey();
  if (!apiKey) {
    throw new Error('Groq API Key is not configured for Voice. Please enter your Groq API Key in Settings (chrome://settings).');
  }
  return true;
}

/**
 * Converts a Float32Array to a WAV format Buffer
 */
function float32ToWav(float32Array, sampleRate = 16000) {
  const numFrames = float32Array.length;
  const numChannels = 1;
  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * blockAlign;
  
  const buffer = Buffer.alloc(44 + dataSize);
  
  // RIFF chunk descriptor
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  
  // fmt sub-chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34);
  
  // data sub-chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  
  // Write audio data
  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    let val = s < 0 ? s * 0x8000 : s * 0x7FFF;
    buffer.writeInt16LE(val, offset);
    offset += 2;
  }
  
  return buffer;
}

/**
 * Transcribe a Float32Array of audio samples at 16kHz using Groq Whisper.
 * @param {Float32Array} audioData - The audio samples
 * @returns {Promise<string>} The transcribed text
 */
async function transcribe(audioData) {
  await ensureLoaded();
  
  let maxAmp = 0;
  let sumAmp = 0;
  for (let i = 0; i < audioData.length; i++) {
    const val = Math.abs(audioData[i]);
    if (val > maxAmp) maxAmp = val;
    sumAmp += val;
  }
  const avgAmp = sumAmp / audioData.length;

  console.log(`[WhisperEngine] Transcribing ${audioData.length} samples (${(audioData.length / 16000).toFixed(1)}s of audio) via Groq API...`);
  console.log(`[WhisperEngine] Audio stats - Max Amplitude: ${maxAmp.toFixed(6)}, Avg Amplitude: ${avgAmp.toFixed(6)}`);

  if (maxAmp === 0) {
    console.warn(`[WhisperEngine] WARNING: Audio buffer is completely silent (all zeros)!`);
    return '';
  }

  // Cap to max 30 seconds of audio (16,000 * 30 = 480,000 samples) to prevent 413 Payload Too Large
  const MAX_SAMPLES = 16000 * 30;
  let finalAudioData = audioData;
  if (audioData.length > MAX_SAMPLES) {
    console.warn(`[WhisperEngine] Audio buffer large (${(audioData.length / 16000).toFixed(1)}s). Truncating to last 30s.`);
    finalAudioData = audioData.slice(-MAX_SAMPLES);
  }

  try {
    const wavBuffer = float32ToWav(finalAudioData, 16000);
    const formData = new FormData();
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    formData.append('file', blob, 'audio.wav');
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('response_format', 'json');

    const apiKey = await getGroqApiKey();
    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API Error: ${response.status} - ${errorText}`);
    }

    const json = await response.json();
    const text = json.text ? json.text.trim() : '';
    console.log(`[WhisperEngine] Transcription result: "${text}"`);
    return text;
  } catch (error) {
    console.error('[WhisperEngine] Transcription failed:', error);
    throw error;
  }
}

function getStatus() {
  return { isReady, isLoading };
}

module.exports = { ensureLoaded, transcribe, getStatus };
