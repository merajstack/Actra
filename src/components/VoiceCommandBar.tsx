import React, { useState, useEffect, useRef } from 'react';
import { Mic, Loader2, CheckCircle2, AlertCircle, X, Sparkles } from 'lucide-react';

type VoiceState = 'IDLE' | 'LISTENING' | 'TRANSCRIBING' | 'THINKING' | 'WORKING' | 'COMPLETED' | 'ERROR' | 'AI_RESPONDING';

export const VoiceCommandBar: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [state, setState] = useState<VoiceState>('IDLE');
  const [transcript, setTranscript] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const finalTranscriptRef = useRef<string>('');
  const isStoppingRef = useRef<boolean>(false);
  const isHoldReleasedRef = useRef<boolean>(false);
  const isChunkProcessingRef = useRef<boolean>(false);

  useEffect(() => {
    // Start recording immediately when mounted (first push of Cmd+D)
    startRecording();

    // Listen for task updates from the main process
    const handleVoiceStateUpdate = (data: any) => {
      if (data.state === 'ERROR') {
        handleError(data.message || 'Unknown error');
      } else {
        setState(data.state);
        if (data.message) {
          setTranscript(data.message);
        }
      }
    };
    
    // Listen for AI chat updates (to display AI response in the bar)
    const handleChatUpdate = (data: any) => {
      if (data.messages && data.messages.length > 0) {
        const lastMsg = data.messages[data.messages.length - 1];
        if (lastMsg.role === 'assistant' && lastMsg.content) {
          setState('AI_RESPONDING');
          setTranscript(lastMsg.content);
        }
      }
    };

    (window as any).electronAPI.onVoiceStateUpdate(handleVoiceStateUpdate);
    
    if ((window as any).electronAPI.onChatUpdated) {
      (window as any).electronAPI.onChatUpdated(handleChatUpdate);
    }

    return () => {
      cleanupAudio();
    };
  }, []);

  useEffect(() => {
    const handleHoldStart = () => {
      setState(currentState => {
        if (currentState !== 'LISTENING' && currentState !== 'TRANSCRIBING') {
          setTimeout(startRecording, 0);
        }
        return currentState;
      });
    };

    const handleHoldEnd = () => {
      isHoldReleasedRef.current = true;
      setState(currentState => {
        if (currentState === 'LISTENING') {
          setTimeout(stopRecordingAndSubmit, 0);
        }
        return currentState;
      });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanupAudio();
        onClose();
      }
    };

    window.addEventListener('voice-hold-start', handleHoldStart);
    window.addEventListener('voice-hold-end', handleHoldEnd);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('voice-hold-start', handleHoldStart);
      window.removeEventListener('voice-hold-end', handleHoldEnd);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleError = (msg: string) => {
    setState('ERROR');
    setErrorMsg(msg);
    cleanupAudio();
    setTimeout(() => {
      resetToIdle();
    }, 4000);
  };

  const resetToIdle = () => {
    setState('IDLE');
    setTranscript('');
    setErrorMsg('');
    finalTranscriptRef.current = '';
    isStoppingRef.current = false;
    isHoldReleasedRef.current = false;
  };

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  // VAD state
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number>(0);
  const hasSpokenRef = useRef(false);
  const silenceStartRef = useRef<number>(0);

  const startRecording = async () => {
    setState('LISTENING');
    if (finalTranscriptRef.current === '') {
      setTranscript('Listening...');
    } else {
      setTranscript(finalTranscriptRef.current + '...');
    }
    
    audioChunksRef.current = [];
    isStoppingRef.current = false;
    isHoldReleasedRef.current = false;
    hasSpokenRef.current = false;
    silenceStartRef.current = 0;
    isChunkProcessingRef.current = false;

    const hasMicAccess = await (window as any).electronAPI.requestMicAccess();
    if (!hasMicAccess) {
      handleError('Microphone access denied by OS.');
      return;
    }

    try {
      if (!mediaStreamRef.current) {
        mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      
      startRecorderAndVAD(mediaStreamRef.current);
    } catch (err: any) {
      handleError('Failed to start microphone.');
    }
  };

  const startRecorderAndVAD = (stream: MediaStream) => {
    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        audioChunksRef.current.push(e.data);
      }
    };

    // Set up VAD (Voice Activity Detection)
    if (!audioContextRef.current) {
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;
    }
    
    const dataArray = new Uint8Array(analyserRef.current!.frequencyBinCount);
    
    const checkAudioLevel = () => {
      if (isStoppingRef.current || !analyserRef.current) return;
      
      analyserRef.current.getByteFrequencyData(dataArray);
      
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;
      
      const VOLUME_THRESHOLD = 15;
      const SILENCE_DURATION_MS = 1000; // 1 second of silence triggers chunk transcription
      
      if (average > VOLUME_THRESHOLD) {
        hasSpokenRef.current = true;
        silenceStartRef.current = 0; // Reset silence timer
      } else if (hasSpokenRef.current && !isChunkProcessingRef.current) {
        if (silenceStartRef.current === 0) {
          silenceStartRef.current = Date.now();
        } else if (Date.now() - silenceStartRef.current > SILENCE_DURATION_MS) {
          // User paused mid-sentence. Transcribe chunk!
          if (!isHoldReleasedRef.current) {
            transcribeChunk();
          }
          return; // Stop VAD loop for now, transcribeChunk will restart it
        }
      }
      
      animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
    };
    
    checkAudioLevel(); // Start loop
    mediaRecorder.start(100);
  };

  const cleanupAudio = () => {
    isStoppingRef.current = true;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
  };

  // Helper to decode audio
  const decodeAndTranscribe = async (blobs: Blob[]) => {
    const blob = new Blob(blobs, { type: 'audio/webm' });
    const arrayBuffer = await blob.arrayBuffer();
    
    const audioCtx = new AudioContext({ sampleRate: 16000 });
    const decodedData = await audioCtx.decodeAudioData(arrayBuffer);
    const float32Audio = decodedData.getChannelData(0);
    await audioCtx.close();

    if (float32Audio.length < 1600) return null; // Too short

    const result = await (window as any).electronAPI.transcribeAudio(float32Audio.buffer);
    if (!result.success) throw new Error(result.error);
    return result.text?.trim();
  };

  const transcribeChunk = async () => {
    if (isChunkProcessingRef.current || audioChunksRef.current.length === 0) return;
    isChunkProcessingRef.current = true;
    
    // 1. Pause VAD
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    
    // 2. Stop recorder to flush current chunks
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    await new Promise(r => setTimeout(r, 50)); // allow flush
    
    // 3. Grab chunks and reset for next batch
    const currentChunks = [...audioChunksRef.current];
    audioChunksRef.current = [];
    
    // 4. Instantly restart recording so we don't miss speech
    if (!isHoldReleasedRef.current && mediaStreamRef.current) {
      startRecorderAndVAD(mediaStreamRef.current);
    }
    
    try {
      const text = await decodeAndTranscribe(currentChunks);
      if (text) {
        const prefix = finalTranscriptRef.current ? finalTranscriptRef.current + ' ' : '';
        finalTranscriptRef.current = prefix + text;
        setTranscript(finalTranscriptRef.current + '...');
      }
    } catch (err) {
      console.warn("Chunk transcription failed", err);
    }
    
    isChunkProcessingRef.current = false;
    hasSpokenRef.current = false; // Reset spoken state for the next chunk
  };

  const stopRecordingAndSubmit = async () => {
    setState('TRANSCRIBING');
    
    // Force final chunk transcription if there's leftover audio
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    await new Promise(r => setTimeout(r, 100));
    cleanupAudio();

    try {
      if (audioChunksRef.current.length > 0) {
        const text = await decodeAndTranscribe(audioChunksRef.current);
        if (text) {
          const prefix = finalTranscriptRef.current ? finalTranscriptRef.current + ' ' : '';
          finalTranscriptRef.current = prefix + text;
        }
      }

      if (!finalTranscriptRef.current) {
        handleError('No speech detected.');
        return;
      }

      setTranscript(finalTranscriptRef.current);
      await new Promise(r => setTimeout(r, 500)); // Show what was transcribed

      setState('THINKING');
      setTranscript('Executing: ' + finalTranscriptRef.current);
      (window as any).electronAPI.executeVoiceCommand(finalTranscriptRef.current);
    } catch (err: any) {
      handleError('Transcription failed: ' + (err.message || 'Unknown error'));
    }
  };

  // UI Rendering
  const displayString = state === 'ERROR' ? errorMsg : transcript;
  
  const renderSoundwave = () => {
    if (state !== 'LISTENING' && state !== 'TRANSCRIBING') return null;
    return (
      <div className="flex items-center space-x-[2px] ml-3 shrink-0">
        <div className="w-[3px] h-3 bg-[#D4C366] rounded-full animate-[soundwave_1.2s_ease-in-out_infinite]" style={{ animationDelay: '0ms' }} />
        <div className="w-[3px] h-5 bg-[#D4C366] rounded-full animate-[soundwave_1.2s_ease-in-out_infinite]" style={{ animationDelay: '200ms' }} />
        <div className="w-[3px] h-3 bg-[#D4C366] rounded-full animate-[soundwave_1.2s_ease-in-out_infinite]" style={{ animationDelay: '400ms' }} />
        <div className="w-[3px] h-6 bg-[#D4C366] rounded-full animate-[soundwave_1.2s_ease-in-out_infinite]" style={{ animationDelay: '600ms' }} />
        <div className="w-[3px] h-4 bg-[#D4C366] rounded-full animate-[soundwave_1.2s_ease-in-out_infinite]" style={{ animationDelay: '800ms' }} />
      </div>
    );
  };

  const renderStatusBadge = () => {
    let colorClass = "text-zinc-500";
    let text = state;
    if (state === 'LISTENING') colorClass = "text-[#D4C366]";
    if (state === 'WORKING' || state === 'THINKING' || state === 'TRANSCRIBING') {
      colorClass = "text-orange-400";
    }
    if (state === 'COMPLETED') colorClass = "text-green-500";
    if (state === 'AI_RESPONDING') {
      colorClass = "text-blue-400";
      text = "ACTRA AI";
    }
    if (state === 'ERROR') colorClass = "text-red-500";
    
    return (
      <div className={`text-[10px] font-bold tracking-[0.2em] uppercase ml-4 ${colorClass} shrink-0`}>
        {text}
      </div>
    );
  };

  return (
    <div className="flex justify-center w-full mt-[34px] pointer-events-auto [-webkit-app-region:no-drag]">
      <style>{`
        @keyframes soundwave {
          0%, 100% { height: 12px; }
          50% { height: 24px; }
        }
      `}</style>
      <div 
        className="min-h-[52px] min-w-[400px] max-w-[600px] bg-[#111111] border border-white/5 rounded-3xl shadow-2xl flex items-center px-5 py-2 shrink-0 transition-all duration-300"
      >
        <div className="shrink-0 flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            <path d="M2 12h20"></path>
          </svg>
        </div>
        
        {renderSoundwave()}
        
        <div className="flex-1 min-w-[200px] ml-4 max-h-[300px] flex flex-col justify-center overflow-y-auto overflow-x-hidden py-1 custom-scrollbar">
          <div className="text-[14px] font-mono text-zinc-300 break-words whitespace-pre-wrap w-full tracking-wide leading-relaxed">
            {displayString || (state === 'LISTENING' ? '' : '...')}
          </div>
        </div>

        {renderStatusBadge()}
        
        <button 
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="ml-3 p-1 rounded-full text-zinc-500 hover:text-white hover:bg-white/10 transition-colors shrink-0 cursor-pointer pointer-events-auto"
          title="Close"
        >
          <X className="w-4 h-4 pointer-events-none" />
        </button>
      </div>
    </div>
  );
};
