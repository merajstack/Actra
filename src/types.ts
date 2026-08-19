export interface Tab {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isPinned?: boolean;
  isMuted?: boolean;
  isIncognito?: boolean;
  zoomLevel: number;
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  folderId?: string;
  dateAdded: number;
  favicon?: string;
}

export interface BookmarkFolder {
  id: string;
  title: string;
  parentId?: string;
}

export interface HistoryItem {
  id: string;
  title: string;
  url: string;
  visitTime: number;
  visitCount: number;
  favicon?: string;
}

export interface DownloadItem {
  id: string;
  filename: string;
  url: string;
  sourceUrl?: string;
  localPath?: string;
  mimeType?: string;
  fileSize: string;
  receivedBytes: number;
  totalBytes: number;
  state: 'progressing' | 'completed' | 'paused' | 'cancelled';
  speed?: string;
  startTime: number;
}

export interface SavedCredential {
  id: string;
  origin: string;
  username: string;
  passwordEncrypted: string;
  lastUsed: number;
}

export type BrowserMode = 'browser' | 'history' | 'bookmarks' | 'downloads' | 'settings' | 'help' | 'newtab';

// ─── AI Workflow State Machine ───────────────────────────────────────────────

export type AIWorkflowState =
  | 'queued'
  | 'understanding'
  | 'planning'
  | 'gathering'
  | 'analyzing'
  | 'preparing'
  | 'waiting_approval'
  | 'executing'
  | 'verifying'
  | 'logging'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'rejected';

export interface AITaskStep {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  output?: string;
  phase?: string;
  screenshot?: string;
  predictedTarget?: { x: number; y: number };
}

export interface AITask {
  id: string;
  goal: string;
  agentId: string;
  status: AIWorkflowState;
  progress: number;
  createdAt: number;
  updatedAt: number;
  steps: AITaskStep[];
  outputs: string | null;
  error: string | null;
  understanding?: {
    intent: string;
    required_apps: string[];
    approval_required: boolean;
  };
}

export interface AIProviderSettings {
  cloudflareAccountId: string;
  cloudflareApiKey: string;
  groqKey: string;
}

// ─── Approval ────────────────────────────────────────────────────────────────

export interface AIApprovalRequest {
  id: string;
  taskId?: string;
  action: {
    name: string;
    args: Record<string, any>;
  };
  context?: {
    url?: string;
    title?: string;
  };
  /** Human-readable summary of what will happen */
  summary?: string;
  /** For emails: the draft body to preview */
  generatedContent?: string;
  /** External parties that will be affected */
  recipients?: string[];
  /** Risk classification 0=low, 1=medium, 2=high */
  riskLevel?: number;
  /** Why the agent is requesting this action */
  reason?: string;
  /** Potential irreversible consequences */
  consequences?: string;
}

// ─── Audit Log ───────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  workflow_id: string;
  user_request: string;
  timestamp: number;
  agent_plan: string;
  data_sources_used: string[];
  actions_proposed: string[];
  approval_required: boolean;
  approval_status: 'auto_approved' | 'approved' | 'rejected' | 'edited' | 'pending' | 'not_required';
  approved_by?: string;
  execution_status: 'success' | 'failed' | 'cancelled' | 'not_executed';
  execution_result?: string;
  error?: string;
}

// ─── Chat ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  taskId?: string;        // If the message is tied to an active task (for rendering task progress)
  approvalId?: string;    // If the message contains an approval request
  toolName?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}
