/**
 * Whisper Engine - Runs Whisper speech-to-text.
 * Uses Groq API (whisper-large-v3-turbo) for instant, highly accurate transcription.
 */
require('dotenv').config();

let isLoading = false;
let isReady = true;

async function ensureLoaded() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === 'YOUR_GROQ_API_KEY') {
    throw new Error('Groq API Key is not configured. Please set GROQ_API_KEY in your .env file to use Voice Commands.');
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

  try {
    const wavBuffer = float32ToWav(audioData, 16000);
    const formData = new FormData();
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    formData.append('file', blob, 'audio.wav');
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('response_format', 'json');

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
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
