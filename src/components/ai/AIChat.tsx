import React, { useEffect, useState, useRef } from 'react';
import {
  X, Sparkles, CheckCircle2, AlertTriangle, Play, Loader2, Send, Mic,
  User, Bot, ChevronUp, ChevronDown, CheckCheck, Check, Pencil, Ban, Trash2, StopCircle, MailOpen, Calendar, Sheet, FileText, Search, Database, Zap, Maximize2, Minimize2, BookOpen, Code2
} from 'lucide-react';
import { AITask, AIApprovalRequest, ChatSession, ChatMessage } from '../../types';

// ─── MCQ Subject → Model map ─────────────────────────────────────────────────
const MCQ_SUBJECTS = [
  {
    label: 'English / Verbal / General',
    shortLabel: 'English / General',
    model: '@cf/openai/gpt-oss-120b',
    modelName: 'gpt-oss-120b',
    icon: BookOpen,
    description: 'Verbal reasoning, reading comprehension & general knowledge',
  },
  {
    label: 'Coding / Web Dev',
    shortLabel: 'Coding / Dev',
    model: '@cf/qwen/qwen2.5-coder-32b-instruct',
    modelName: 'qwen2.5-coder-32b',
    icon: Code2,
    description: 'Code synthesis, syntax, algorithms & debugging',
  },
] as const;

type McqSubjectLabel = typeof MCQ_SUBJECTS[number]['label'];

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

function sanitizeEmailPreview(value: string) {
  return String(value || '')
    .replace(/<\/?(script|style|iframe|object|embed|form)[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/<meta[^>]*>/gi, '')
    .replace(/<link[^>]*>/gi, '');
}

// ─── ApprovalCard ────────────────────────────────────────────────────────────
const ApprovalCard: React.FC<any> = ({ approval, onApprove, onReject, onEdit, onEnhance }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
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

  const handleEnhance = async () => {
    setIsEnhancing(true);
    try {
      await onEnhance(approval.id);
    } finally {
      setIsEnhancing(false);
    }
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
        {approval.htmlPreview && (
          <div className="rounded-lg border border-zinc-200 overflow-hidden">
            <div className="px-3 py-1.5 bg-zinc-50 border-b border-zinc-200">
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Rendered email preview</span>
            </div>
            <div
              className="p-3 bg-white max-h-72 overflow-y-auto text-sm"
              dangerouslySetInnerHTML={{ __html: sanitizeEmailPreview(approval.htmlPreview) }}
            />
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
        {approval.action.name === 'send_email' && !approval.isHtmlRequest && (
          <button
            onClick={handleEnhance}
            disabled={isEnhancing}
            className="w-full flex items-center justify-center space-x-1.5 border border-orange-200 bg-orange-50 hover:bg-orange-100 disabled:opacity-60 text-orange-700 text-xs font-semibold py-2 rounded-lg transition-colors"
          >
            {isEnhancing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>{isEnhancing ? 'Enhancing email...' : 'Enhance with AI'}</span>
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Task Progress ────────────────────────────────────────────────────────
const TaskProgress: React.FC<{ taskId: string, tasks: AITask[], fallbackContent?: string }> = ({ taskId, tasks, fallbackContent }) => {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return <div className="text-[13px] text-black font-medium">Starting request...</div>;

  const isFailed = task.status === 'failed' || task.status === 'rejected';
  const isActive = !['completed', 'failed', 'cancelled', 'rejected'].includes(task.status);

  if (task.status === 'completed') {
    return <div className="text-[13px] text-black leading-relaxed whitespace-pre-wrap font-normal">{task.outputs || fallbackContent || 'Task completed, but Actra returned an empty response.'}</div>;
  }

  if (isFailed && task.error) {
    return <div className="text-[13px] text-red-700 bg-red-50 p-3 rounded-lg border border-red-200 font-medium">{task.error}</div>;
  }

  if (isFailed || task.status === 'cancelled') {
    return <div className="text-[13px] text-red-700 bg-red-50 p-3 rounded-lg border border-red-200 font-medium">
      {task.status === 'cancelled' ? 'Request cancelled.' : 'Actra could not complete this request.'}
    </div>;
  }

  return (
    <div className="space-y-2 w-full text-black">
      <div className="flex items-center space-x-2">
        {isActive && <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />}
        <span className="text-xs font-semibold text-orange-700">
          {task.status === 'understanding' ? 'Understanding request...' :
           task.status === 'planning' ? 'Planning...' :
           task.status === 'gathering' ? 'Gathering context...' :
           task.status === 'waiting_approval' ? 'Waiting for approval...' :
           task.status === 'executing' ? 'Executing actions...' : 'Working...'}
        </span>
      </div>
      {task.steps.map(step => (
        <div key={step.id} className="flex flex-col items-start space-y-1 text-[12px] text-black mb-2">
          <div className="flex items-center space-x-2 text-black">
            <span className="mt-0.5 font-bold">{step.status === 'completed' ? '✓' : step.status === 'running' ? '▶' : step.status === 'failed' ? '❌' : '·'}</span>
            <span className="text-black font-medium">{step.description}</span>
          </div>
          {step.screenshot && (
            <div className="relative mt-2 rounded-md overflow-hidden border border-zinc-200 shadow-sm self-stretch max-w-full">
              <img src={step.screenshot} alt="Agent View" className="w-full object-contain bg-zinc-950" style={{ maxHeight: '200px' }} />
              {step.predictedTarget && (
                <div
                  className="absolute w-4 h-4 rounded-full border-2 border-red-500 bg-red-500/30 flex items-center justify-center transform -translate-x-1/2 -translate-y-1/2 pointer-events-none shadow-[0_0_8px_rgba(239,68,68,0.8)]"
                  style={{
                    // This assumes the screenshot is displayed at natural aspect ratio.
                    // For perfect precision, we'd need exact CSS dimension scaling, but this gives the visual gist:
                    left: `${(step.predictedTarget.x / 1440) * 100}%`, // Rough estimate based on standard 1440px width
                    top: `${(step.predictedTarget.y / 900) * 100}%`
                  }}
                >
                  <div className="w-0.5 h-full bg-red-500 absolute"></div>
                  <div className="h-0.5 w-full bg-red-500 absolute"></div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export interface AIChatProps {
  onClose: () => void;
  activeTabId: string | null;
  approvals?: AIApprovalRequest[];
  setApprovals?: React.Dispatch<React.SetStateAction<AIApprovalRequest[]>>;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export const AIChat: React.FC<AIChatProps> = ({
  onClose,
  activeTabId,
  approvals: propApprovals,
  setApprovals: propSetApprovals,
  isExpanded: controlledExpanded,
  onToggleExpand,
}) => {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
  const toggleExpand = onToggleExpand || (() => setInternalExpanded(prev => !prev));

  const [session, setSession] = useState<ChatSession | null>(null);
  const [input, setInput] = useState('');
  const [tasks, setTasks] = useState<AITask[]>([]);
  const [localApprovals, setLocalApprovals] = useState<AIApprovalRequest[]>([]);

  const approvals = propApprovals !== undefined ? propApprovals : localApprovals;
  const setApprovals = propSetApprovals !== undefined ? propSetApprovals : setLocalApprovals;

  // MCQ subject selector — persists for the session, user can change mid-quiz
  const [mcqSubject, setMcqSubject] = useState<McqSubjectLabel>('English / Verbal / General');
  const [isSubjectDropdownOpen, setIsSubjectDropdownOpen] = useState(false);
  const subjectTriggerRef = useRef<HTMLButtonElement>(null);
  const subjectDropdownRef = useRef<HTMLDivElement>(null);

  const selectedSubjectObj = MCQ_SUBJECTS.find(s => s.label === mcqSubject) || MCQ_SUBJECTS[0];
  const mcqModel = selectedSubjectObj.model;

  const [isRecording, setIsRecording] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
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
    api.getApprovals().then(setApprovals);

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
    api.onAIApprovalUpdated((updatedApproval: AIApprovalRequest) => {
      setApprovals(prev => prev.map(approval => approval.id === updatedApproval.id ? updatedApproval : approval));
    });

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inTrigger = subjectTriggerRef.current?.contains(target);
      const inDropdown = subjectDropdownRef.current?.contains(target);
      if (!inTrigger && !inDropdown) {
        setIsSubjectDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsSubjectDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim()) return;
    const msg = input.trim();
    setInput('');
    setSession(prev => ({
      id: prev?.id || 'active',
      title: prev?.title || 'Chat',
      messages: [...(prev?.messages || []), {
        id: `local-${Date.now()}`,
        role: 'user',
        content: msg,
        timestamp: Date.now(),
      }],
      updatedAt: Date.now(),
    }));
    try {
      await api.sendChatMessage(msg, activeTabId, mcqModel);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSession(prev => ({
        id: prev?.id || 'active',
        title: prev?.title || 'Chat',
        messages: [...(prev?.messages || []), {
          id: `local-error-${Date.now()}`,
          role: 'assistant',
          content: `Actra could not start this request: ${message}`,
          timestamp: Date.now(),
        }],
        updatedAt: Date.now(),
      }));
    }
  };

  const handleClear = async () => {
    if (api.cancelAllTasks) {
      await api.cancelAllTasks();
    } else {
      await Promise.all(
        tasks
          .filter(t => !['completed', 'failed', 'cancelled', 'rejected'].includes(t.status))
          .map(t => api.cancelTask(t.id))
      );
    }
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
  const handleEnhance = async (id: string) => {
    const result = await api.enhanceApproval(id);
    if (!result?.success) throw new Error(result?.error || 'Could not enhance email.');
  };

  const toggleRecording = async () => {
    if (isRecording) {
      // Stop recording and transcribe
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach(t => t.stop()); mediaStreamRef.current = null; }

      setIsRecording(false);

      // Wait a brief moment for the final ondataavailable event to fire
      await new Promise(r => setTimeout(r, 100));

      if (audioChunksRef.current.length > 0) {
        setInput(baseTextRef.current + 'Transcribing...');
        try {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const arrayBuffer = await blob.arrayBuffer();

          const audioCtx = new AudioContext({ sampleRate: 16000 });
          const decodedData = await audioCtx.decodeAudioData(arrayBuffer);
          const float32Audio = decodedData.getChannelData(0);
          await audioCtx.close();

          if (float32Audio.length > 1600) {
            const result = await api.transcribeAudio(float32Audio.buffer);
            if (result.success && result.text?.trim()) {
              setInput(baseTextRef.current + result.text.trim());
            } else {
              setInput(baseTextRef.current); // Restore original text
            }
          } else {
            setInput(baseTextRef.current); // Too short
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
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start(100);
    } catch (err) {
      console.error('Mic error:', err);
      setIsRecording(false);
    }
  };

  return (
    <div className="w-full h-full bg-white flex flex-col overflow-hidden select-text">
      {/* Header */}
      <div className="h-12 border-b border-[#E8E2D5] flex items-center justify-between px-4 shrink-0 bg-[#FDFBF7]">
        <div className="flex items-center space-x-2 text-zinc-900 font-semibold text-sm">
          <div className="w-6 h-6 rounded-md bg-orange-500/10 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-orange-600" />
          </div>
          <span>Actra AI</span>
        </div>
        <div className="flex space-x-1 items-center">
          <button 
            onClick={toggleExpand} 
            className="p-1.5 rounded-lg hover:bg-zinc-200/70 text-zinc-400 hover:text-zinc-600 cursor-pointer transition-colors" 
            title={isExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button 
            onClick={handleClear} 
            className="p-1.5 rounded-lg hover:bg-zinc-200/70 text-zinc-400 hover:text-red-500 cursor-pointer transition-colors" 
            title="Clear Chat"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-lg hover:bg-zinc-200/70 text-zinc-400 hover:text-zinc-700 cursor-pointer transition-colors" 
            title="Close Sidebar"
          >
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

              <div className={`max-w-[85%] relative ${isUser ? 'bg-[#F2EFE9] text-black border border-[#E0DACB] px-4 py-2.5 rounded-2xl rounded-tr-sm shadow-sm' : 'bg-[#FAF8F5] text-black border border-[#E8E2D5] px-4 py-2.5 rounded-2xl rounded-tl-sm shadow-sm'}`}>
                {isUser ? (
                  <div className="text-[13px] text-black leading-relaxed whitespace-pre-wrap font-medium">{msg.content}</div>
                ) : (
                  <div className="space-y-3 text-black">
                    {msg.taskId ? (
                      <TaskProgress taskId={msg.taskId} tasks={tasks} fallbackContent={msg.content} />
                    ) : (
                      <div className="text-[13px] text-black leading-relaxed whitespace-pre-wrap font-normal">{msg.content}</div>
                    )}

                    {/* Render Approvals Inline */}
                    {taskApprovals.map(approval => (
                      <ApprovalCard
                        key={approval.id}
                        approval={approval}
                        onApprove={handleApprove}
                        onReject={handleReject}
                        onEdit={handleEdit}
                        onEnhance={handleEnhance}
                      />
                    ))}
                  </div>
                )}

                {/* Copy Button (Shows on Hover) */}
                <button
                  onClick={async () => {
                    let finalContent = msg.taskId && tasks.find(t => t.id === msg.taskId)?.outputs
                      ? tasks.find(t => t.id === msg.taskId)?.outputs
                      : msg.content;

                    if (typeof finalContent === 'object') {
                      finalContent = JSON.stringify(finalContent, null, 2);
                    } else if (typeof finalContent !== 'string') {
                      finalContent = String(finalContent || '');
                    }

                    try {
                      if ((window as any).electronAPI?.copyToClipboard) {
                        await (window as any).electronAPI.copyToClipboard(finalContent);
                      } else if (navigator.clipboard?.writeText) {
                        await navigator.clipboard.writeText(finalContent);
                      } else {
                        throw new Error('Clipboard access is unavailable');
                      }
                      setCopiedId(msg.id);
                      setTimeout(() => setCopiedId(null), 2000);
                    } catch (error) {
                      console.error('Copy failed:', error);
                    }
                  }}
                  className={`absolute opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md shadow-sm border bg-white text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50 z-10 ${isUser ? 'left-1 top-1 border-zinc-700' : 'right-1 top-1 border-zinc-200'}`}
                  title={copiedId === msg.id ? "Copied!" : "Copy to clipboard"}
                >
                  {copiedId === msg.id ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                  )}
                </button>
              </div>
            </div>
          );
        })}

        {/* Fallback for any approvals that didn't match a message's taskId */}
        {(() => {
          const matchedApprovalIds = new Set(
            session?.messages.flatMap(msg =>
              msg.taskId ? approvals.filter(a => a.taskId === msg.taskId).map(a => a.id) : []
            ) || []
          );
          const unmatchedApprovals = approvals.filter(a => !matchedApprovalIds.has(a.id));

          if (unmatchedApprovals.length === 0) return null;

          return (
            <div className="mt-4">
              {unmatchedApprovals.map(approval => (
                <ApprovalCard
                  key={`fallback-${approval.id}`}
                  approval={approval}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onEdit={handleEdit}
                  onEnhance={handleEnhance}
                />
              ))}
            </div>
          );
        })()}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 p-3 border-t border-[#E8E2D5] bg-[#FDFBF7] relative">
        {/* Antigravity-style Model/Subject Selector Pill */}
        <div className="relative mb-2">
          <div className="flex items-center justify-between px-0.5">
            <button
              id="mcq-subject-dropdown-trigger"
              ref={subjectTriggerRef}
              type="button"
              onClick={() => setIsSubjectDropdownOpen(prev => !prev)}
              className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 border border-zinc-200/90 rounded-lg shadow-sm hover:border-zinc-300 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-500/20 group max-w-full"
              title="Click to switch MCQ / quiz solver model"
            >
              <div className="w-4 h-4 rounded flex items-center justify-center bg-orange-50 text-orange-600 group-hover:bg-orange-100 transition-colors shrink-0">
                {React.createElement(selectedSubjectObj.icon, { className: 'w-3 h-3' })}
              </div>
              <span className="text-zinc-800 font-medium truncate">{selectedSubjectObj.shortLabel}</span>
              <span className="text-[10px] text-zinc-500 font-mono bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200/60 shrink-0">
                {selectedSubjectObj.modelName}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-zinc-400 transition-transform duration-200 ${isSubjectDropdownOpen ? 'rotate-180 text-orange-500' : ''}`} />
            </button>
            <span className="text-[10px] text-zinc-400 font-medium ml-2 shrink-0">Subject-tuned solver</span>
          </div>

          {/* Antigravity-style Model Dropdown Menu */}
          {isSubjectDropdownOpen && (
            <div
              ref={subjectDropdownRef}
              className="absolute bottom-full mb-2 left-0 z-50 w-72 bg-white rounded-xl shadow-2xl border border-zinc-200 py-1.5"
            >
              <div className="px-3 py-1.5 border-b border-zinc-100 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Quiz / MCQ Model
                </span>
                <span className="text-[10px] text-zinc-400 font-medium">Subject Specialized</span>
              </div>
              <div className="p-1 space-y-1">
                {MCQ_SUBJECTS.map((item) => {
                  const isSelected = item.label === mcqSubject;
                  const ItemIcon = item.icon;
                  return (
                    <button
                      key={item.model}
                      type="button"
                      onClick={() => {
                        setMcqSubject(item.label as McqSubjectLabel);
                        setIsSubjectDropdownOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-2.5 rounded-lg flex items-start gap-2.5 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-orange-50 border border-orange-200'
                          : 'hover:bg-zinc-50 border border-transparent'
                      }`}
                    >
                      <div className={`mt-0.5 p-1.5 rounded-md shrink-0 ${
                        isSelected ? 'bg-orange-500 text-white' : 'bg-zinc-100 text-zinc-500'
                      }`}>
                        <ItemIcon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-xs font-medium ${isSelected ? 'text-orange-900 font-semibold' : 'text-zinc-800'}`}>
                            {item.label}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-orange-600 shrink-0" />}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] font-mono text-zinc-600 bg-zinc-100 px-1.5 py-0.5 rounded">
                            {item.modelName}
                          </span>
                          <span className="text-[10px] text-zinc-400 truncate">
                            {item.description}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Text Input Bar */}
        <form onSubmit={handleSend} className="relative flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask Actra AI..."
            autoFocus
            className="w-full pl-4 pr-24 py-3 bg-white border border-zinc-300 rounded-xl text-sm text-black placeholder:text-zinc-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 shadow-sm font-normal"
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
        <div className="text-center mt-1.5">
          <span className="text-[10px] text-zinc-400">AI can make mistakes. Verify before approving.</span>
        </div>
      </div>
    </div>
  );
};
