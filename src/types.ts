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

export type BrowserMode = 'browser' | 'history' | 'bookmarks' | 'downloads' | 'settings' | 'help';
