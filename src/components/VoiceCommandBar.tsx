import React, { useState, useEffect, useRef } from 'react';
import { Mic, Loader2, CheckCircle2, AlertCircle, X, Sparkles } from 'lucide-react';

type VoiceState = 'IDLE' | 'LISTENING' | 'TRANSCRIBING' | 'THINKING' | 'WORKING' | 'COMPLETED' | 'ERROR';

export const VoiceCommandBar: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [state, setState] = useState<VoiceState>('IDLE');
  const [transcript, setTranscript] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const finalTranscriptRef = useRef<string>('');
  const isStoppingRef = useRef<boolean>(false);

  useEffect(() => {
    // Start recording immediately when mounted
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
        if (data.state === 'COMPLETED' || data.state === 'ERROR') {
          setTimeout(onClose, 3000); // auto close after a few seconds
        }
      }
    };
    (window as any).electronAPI.onVoiceStateUpdate(handleVoiceStateUpdate);

    return () => {
      cleanupAudio();
    };
  }, []);

  useEffect(() => {
    const handleStop = () => {
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

    window.addEventListener('stop-voice-recording', handleStop);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('stop-voice-recording', handleStop);
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
  };

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioDataRef = useRef<Float32Array>(new Float32Array(0));

  const startRecording = async () => {
    setState('LISTENING');
    setTranscript('');
    finalTranscriptRef.current = '';
    audioDataRef.current = new Float32Array(0);
    isStoppingRef.current = false;

    const hasMicAccess = await (window as any).electronAPI.requestMicAccess();
    if (!hasMicAccess) {
      handleError('Microphone access denied by OS.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      source.connect(processor);
      processor.connect(audioContext.destination);

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const newData = new Float32Array(audioDataRef.current.length + inputData.length);
        newData.set(audioDataRef.current);
        newData.set(inputData, audioDataRef.current.length);
        audioDataRef.current = newData;
      };
      
      setTranscript('Listening...');
    } catch (err: any) {
      handleError('Failed to start microphone.');
    }
  };

  const cleanupAudio = () => {
    isStoppingRef.current = true;
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
  };

  const stopRecordingAndSubmit = async () => {
    setState('TRANSCRIBING');
    setTranscript('Transcribing...');
    
    // Grab the accumulated audio buffer before cleanup
    const audioBuffer = audioDataRef.current;
    cleanupAudio();

    if (audioBuffer.length < 1600) { // Less than 0.1s of audio
      handleError('No speech detected.');
      return;
    }

    try {
      // Send audio to main process for Whisper transcription
      const result = await (window as any).electronAPI.transcribeAudio(audioBuffer.buffer);
      
      if (!result.success) {
        handleError(`Transcription failed: ${result.error}`);
        return;
      }

      const finalCommand = result.text?.trim();
      if (!finalCommand) {
        handleError('No speech detected.');
        return;
      }

      finalTranscriptRef.current = finalCommand;
      setTranscript(finalCommand);
      
      // Brief pause to show the user what was transcribed
      await new Promise(r => setTimeout(r, 500));

      setState('THINKING');
      setTranscript('Executing...');
      (window as any).electronAPI.executeVoiceCommand(finalCommand);
    } catch (err: any) {
      handleError('Transcription failed: ' + (err.message || 'Unknown error'));
    }
  };

  // UI Rendering
  const displayString = state === 'ERROR' ? errorMsg : transcript;
  
  // Soundwave animation bars
  const renderSoundwave = () => {
    if (state !== 'LISTENING' && state !== 'TRANSCRIBING') return null;
    return (
      <div className="flex items-center space-x-[2px] ml-3">
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
    if (state === 'ERROR') colorClass = "text-red-500";
    
    return (
      <div className={`text-[10px] font-bold tracking-[0.2em] uppercase ml-4 ${colorClass}`}>
        {text}
      </div>
    );
  };

  return (
    <div className="flex justify-center w-full mt-[34px] pointer-events-auto">
      <style>{`
        @keyframes soundwave {
          0%, 100% { height: 12px; }
          50% { height: 24px; }
        }
      `}</style>
      <div 
        className="h-[52px] min-w-[400px] max-w-[600px] bg-[#111111] border border-white/5 rounded-full shadow-2xl flex items-center px-5 shrink-0"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <div className="shrink-0 flex items-center justify-center">
          {/* Circular Wireframe Logo matching the reference */}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            <path d="M2 12h20"></path>
          </svg>
        </div>
        
        {renderSoundwave()}
        
        <div className="flex-1 min-w-[200px] ml-4 h-full flex flex-col justify-center overflow-hidden">
          <div className="text-[14px] font-mono text-zinc-300 truncate w-full tracking-wide">
            {displayString || (state === 'LISTENING' ? '' : '...')}
          </div>
        </div>

        {renderStatusBadge()}
      </div>
    </div>
  );
};

