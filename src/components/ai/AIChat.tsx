import React, { useEffect, useState, useRef } from 'react';
import {
  X, Sparkles, CheckCircle2, AlertTriangle, Play, Loader2, Send, Mic,
  User, Bot, ChevronUp, ChevronDown, CheckCheck, Pencil, Ban, Trash2, StopCircle, MailOpen, Calendar, Sheet, FileText, Search, Database, Zap, Maximize2, Minimize2
} from 'lucide-react';
import { AITask, AIApprovalRequest, ChatSession, ChatMessage } from '../../types';

// ─── Helpers ────────────────────────────────────────────────────────────────
const RISK_COLORS = ['text-emerald-600 bg-emerald-50 border-emerald-200',
                     'text-amber-600 bg-amber-50 border-amber-200',
                     'text-blue-600 bg-blue-50 border-blue-200'];
const RISK_LABELS = ['Low Risk', 'Medium Risk', 'High Risk — Approval Required'];

function getActionIcon(name: string) {
  if (name?.includes('email'))    return <MailOpen className="w-4 h-4" />;
  if (name?.includes('calendar')) return <Calendar className="w-4 h-4" />;
  if (name?.includes('sheet'))    return <Sheet className="w-4 h-4" />;
  if (name?.includes('doc'))      return <FileText className="w-4 h-4" />;
  if (name?.includes('search') || name?.includes('read') || name?.includes('get')) return <Search className="w-4 h-4" />;
  if (name?.includes('drive'))    return <Database className="w-4 h-4" />;
  return <Zap className="w-4 h-4" />;
}

// ─── ApprovalCard ────────────────────────────────────────────────────────────
const ApprovalCard: React.FC<any> = ({ approval, onApprove, onReject, onEdit }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(approval.generatedContent || '');
  const riskLevel = approval.riskLevel ?? 2;

  const handleEditSubmit = () => {
    const updates: Record<string, any> = {};
    if (approval.action.name === 'send_email') {
      const lines = editedContent.split('\n');
      const subjectLine = lines.find((l: string) => l.startsWith('Subject:'));
      updates.subject = subjectLine?.replace('Subject:', '').trim() || approval.action.args.subject;
      updates.body = lines.slice(lines.indexOf('') + 1).join('\n').trim() || editedContent;
    } else {
      updates.content = editedContent;
    }
    onEdit(approval.id, updates);
  };

  return (
    <div className={`rounded-xl border overflow-hidden mt-2 shadow-sm ${RISK_COLORS[riskLevel]}`}>
      <div className={`px-4 py-3 border-b flex items-center justify-between ${RISK_COLORS[riskLevel]}`}>
        <div className="flex items-center space-x-2 font-semibold text-sm">
          {getActionIcon(approval.action.name)}
          <span>{approval.summary || approval.action.name}</span>
        </div>
      </div>
      <div className="px-4 py-3 space-y-3 bg-white">
        {approval.reason && <p className="text-xs text-zinc-500 italic">{approval.reason}</p>}
        {approval.generatedContent && (
          <div className="rounded-lg border border-zinc-200 overflow-hidden">
            <div className="px-3 py-1.5 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Preview</span>
              <button onClick={() => setIsEditing(!isEditing)} className="text-[10px] text-orange-500 hover:text-orange-700 font-medium flex items-center">
                <Pencil className="w-3 h-3 mr-1" /> {isEditing ? 'Cancel' : 'Edit'}
              </button>
            </div>
            {isEditing ? (
              <textarea
                className="w-full p-3 text-xs text-zinc-700 font-mono bg-white resize-none outline-none"
                rows={6} value={editedContent} onChange={e => setEditedContent(e.target.value)}
              />
            ) : (
              <pre className="px-3 py-2 text-xs text-zinc-700 whitespace-pre-wrap bg-white font-mono max-h-48 overflow-y-auto">
                {approval.generatedContent}
              </pre>
            )}
          </div>
        )}
        <div className="flex space-x-2 pt-1">
          {isEditing ? (
            <button onClick={handleEditSubmit} className="flex-1 flex items-center justify-center space-x-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold py-2 rounded-lg transition-colors">
              <CheckCheck className="w-3.5 h-3.5" /> <span>Approve Edited</span>
            </button>
          ) : (
            <button onClick={() => onApprove(approval.id)} className="flex-1 flex items-center justify-center space-x-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold py-2 rounded-lg transition-colors">
              <CheckCheck className="w-3.5 h-3.5" /> <span>Approve</span>
            </button>
          )}
          <button onClick={() => onReject(approval.id)} className="px-3 flex items-center space-x-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold py-2 rounded-lg transition-colors border border-red-200">
            <Ban className="w-3.5 h-3.5" /> <span>Reject</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Task Progress ────────────────────────────────────────────────────────
const TaskProgress: React.FC<{ taskId: string, tasks: AITask[] }> = ({ taskId, tasks }) => {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />;

  const isFailed = task.status === 'failed' || task.status === 'rejected';
  const isActive = !['completed', 'failed', 'cancelled', 'rejected'].includes(task.status);
  
  if (task.status === 'completed' && task.outputs) {
    return <div className="text-[13px] text-zinc-800 leading-relaxed whitespace-pre-wrap">{task.outputs}</div>;
  }
  
  if (isFailed && task.error) {
    return <div className="text-[13px] text-red-700 bg-red-50 p-3 rounded-lg border border-red-200">{task.error}</div>;
  }

  return (
    <div className="space-y-2 w-full">
      <div className="flex items-center space-x-2">
        {isActive && <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />}
        <span className="text-xs font-medium text-orange-600">
          {task.status === 'understanding' ? 'Understanding request...' : 
           task.status === 'planning' ? 'Planning...' : 
           task.status === 'gathering' ? 'Gathering context...' : 
           task.status === 'waiting_approval' ? 'Waiting for approval...' : 
           task.status === 'executing' ? 'Executing actions...' : 'Working...'}
        </span>
      </div>
      {task.steps.map(step => (
        <div key={step.id} className="flex items-start space-x-2 text-[11px] opacity-70">
          <span className="mt-0.5">{step.status === 'completed' ? '✓' : step.status === 'running' ? '▶' : '·'}</span>
          <span>{step.description}</span>
        </div>
      ))}
    </div>
  );
};

export const AIChat: React.FC<{ onClose: () => void, activeTabId: string }> = ({ onClose, activeTabId }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [input, setInput] = useState('');
  const [tasks, setTasks] = useState<AITask[]>([]);
  const [approvals, setApprovals] = useState<AIApprovalRequest[]>([]);
  const [isRecording, setIsRecording] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioDataRef = useRef<Float32Array>(new Float32Array(0));
  const baseTextRef = useRef<string>('');
  
  const api = (window as any).electronAPI;

  const loadHistory = async () => {
    const history = await api.getChatHistory();
    // Wrap in a mock session for UI consistency since getChatHistory returns messages array
    setSession({ id: 'active', title: 'Chat', messages: history, updatedAt: Date.now() });
  };

  useEffect(() => {
    loadHistory();
    api.getTasks().then(setTasks);

    api.onAIChatUpdated((updatedSession: ChatSession) => {
      setSession(updatedSession);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });

    api.onAITaskUpdate((task: AITask) => {
      setTasks(prev => {
        const exists = prev.some(t => t.id === task.id);
        return exists ? prev.map(t => t.id === task.id ? task : t) : [task, ...prev];
      });
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        if (task.status === 'completed' || task.status === 'failed') {
          inputRef.current?.focus();
        }
      }, 100);
    });

    api.onAIRequireApproval((approval: AIApprovalRequest) => {
      setApprovals(prev => {
        const exists = prev.some(a => a.id === approval.id);
        return exists ? prev : [approval, ...prev];
      });
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
  }, []);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim()) return;
    const msg = input.trim();
    setInput('');
    await api.sendChatMessage(msg, activeTabId);
  };

  const handleClear = async () => {
    const history = await api.clearChat();
    setSession({ id: 'active', title: 'Chat', messages: history, updatedAt: Date.now() });
    setTasks([]);
    setApprovals([]);
  };

  const handleApprove = (id: string) => {
    api.resolveApproval(id, true);
    setApprovals(prev => prev.filter(a => a.id !== id));
  };
  const handleReject = (id: string) => {
    api.resolveApproval(id, false);
    setApprovals(prev => prev.filter(a => a.id !== id));
  };
  const handleEdit = (id: string, newArgs: Record<string, any>) => {
    api.editApproval(id, newArgs);
    setApprovals(prev => prev.filter(a => a.id !== id));
  };

  const toggleRecording = async () => {
    if (isRecording) {
      // Stop recording and transcribe
      const audioBuffer = audioDataRef.current;
      
      if (processorRef.current) { processorRef.current.disconnect(); processorRef.current = null; }
      if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
      if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach(t => t.stop()); mediaStreamRef.current = null; }
      
      setIsRecording(false);

      if (audioBuffer.length > 1600) {
        setInput(baseTextRef.current + 'Transcribing...');
        try {
          const result = await api.transcribeAudio(audioBuffer.buffer);
          if (result.success && result.text?.trim()) {
            setInput(baseTextRef.current + result.text.trim());
          } else {
            setInput(baseTextRef.current); // Restore original text
          }
        } catch (err) {
          console.error('Transcription error:', err);
          setInput(baseTextRef.current);
        }
      }
      
      inputRef.current?.focus();
      return;
    }
    
    setIsRecording(true);
    baseTextRef.current = input;
    if (baseTextRef.current && !baseTextRef.current.endsWith(' ')) baseTextRef.current += ' ';
    audioDataRef.current = new Float32Array(0);

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
    } catch (err) {
      console.error('Mic error:', err);
      setIsRecording(false);
    }
  };

  return (
    <div className={`${isExpanded ? 'w-[600px]' : 'w-[420px]'} transition-all duration-300 h-[calc(100%-2rem)] mt-4 mr-4 bg-white rounded-2xl border border-[#E8E2D5] flex flex-col shadow-[0_8px_30px_rgb(0,0,0,0.12)] z-50 overflow-hidden shrink-0`}>
      {/* Header */}
      <div className="h-14 border-b border-[#E8E2D5] flex items-center justify-between px-5 shrink-0 bg-[#FDFBF7]">
        <div className="flex items-center space-x-2 text-zinc-900 font-bold">
          <Sparkles className="w-4 h-4 text-[#a04100]" />
          <span>Actra AI</span>
        </div>
        <div className="flex space-x-1">
          <button onClick={() => setIsExpanded(!isExpanded)} className="p-1.5 rounded-lg hover:bg-zinc-200 text-zinc-400 hover:text-zinc-600 cursor-pointer transition-colors" title={isExpanded ? "Minimize" : "Expand"}>
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={handleClear} className="p-1.5 rounded-lg hover:bg-zinc-200 text-zinc-400 hover:text-red-500 cursor-pointer transition-colors" title="Clear Chat">
            <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-200 text-zinc-500 cursor-pointer transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-white">
        {session?.messages.length === 0 && (
          <div className="text-center py-10 text-zinc-400 h-full flex flex-col items-center justify-center">
            <Sparkles className="w-8 h-8 mx-auto mb-3 text-orange-200" />
            <p className="text-sm font-medium">How can I help you today?</p>
          </div>
        )}
        
        {session?.messages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          const taskApprovals = msg.taskId ? approvals.filter(a => a.taskId === msg.taskId) : [];

          return (
            <div key={msg.id || idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'} group`}>
              {!isUser && (
                <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center shrink-0 mr-3 mt-1">
                  <Sparkles className="w-3.5 h-3.5 text-orange-600" />
                </div>
              )}
              
              <div className={`max-w-[85%] relative ${isUser ? 'bg-zinc-900 text-white px-4 py-2.5 rounded-2xl rounded-tr-sm' : 'text-zinc-800'}`}>
                {isUser ? (
                  <div className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                ) : (
                  <div className="space-y-3">
                    {msg.taskId ? (
                      <TaskProgress taskId={msg.taskId} tasks={tasks} />
                    ) : (
                      <div className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                    )}

                    {/* Render Approvals Inline */}
                    {taskApprovals.map(approval => (
                      <ApprovalCard 
                        key={approval.id} 
                        approval={approval} 
                        onApprove={handleApprove} 
                        onReject={handleReject} 
                        onEdit={handleEdit} 
                      />
                    ))}
                  </div>
                )}
                
                {/* Copy Button (Shows on Hover) */}
                <button
                  onClick={() => navigator.clipboard.writeText(msg.content)}
                  className={`absolute opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md shadow-sm border bg-white text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50 ${isUser ? '-left-10 top-0 border-zinc-200' : '-right-10 top-0 border-zinc-200'}`}
                  title="Copy to clipboard"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                </button>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-[#E8E2D5] bg-[#FDFBF7]">
        <form onSubmit={handleSend} className="relative flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask Actra AI..."
            autoFocus
            className="w-full pl-4 pr-24 py-3 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400 shadow-sm"
          />
          <div className="absolute right-2 flex space-x-1 items-center">
            {tasks.some(t => !['completed', 'failed', 'cancelled', 'rejected'].includes(t.status)) ? (
            <button
              type="button"
              onClick={() => {
                const activeTask = tasks.find(t => !['completed', 'failed', 'cancelled', 'rejected'].includes(t.status));
                if (activeTask) api.cancelTask(activeTask.id);
              }}
              className="p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors cursor-pointer"
              title="Terminate Action"
            >
              <StopCircle className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() && !isRecording}
              className="p-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:bg-zinc-200 disabled:text-zinc-400 transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={toggleRecording}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700'}`}
            title={isRecording ? "Stop Dictation" : "Start Dictation"}
          >
            <Mic className="w-4 h-4" />
          </button>
        </div>
      </form>
      <div className="text-center mt-2">
        <span className="text-[10px] text-zinc-400">AI can make mistakes. Verify before approving.</span>
      </div>
      </div>
    </div>
  );
};
