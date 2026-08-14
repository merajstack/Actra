import { Bookmark, BookmarkFolder, HistoryItem, DownloadItem } from '../types';

export const INITIAL_FOLDERS: BookmarkFolder[] = [
  { id: '1', title: 'Bookmarks Bar' },
  { id: '2', title: 'Other Bookmarks' },
  { id: '3', title: 'Development & Tech' },
];

export const INITIAL_BOOKMARKS: Bookmark[] = [
  { id: 'b1', title: 'Actra Start', url: 'chrome://newtab', folderId: '1', dateAdded: Date.now() - 100000 },
  { id: 'b2', title: 'GitHub - Where the world builds software', url: 'https://github.com', folderId: '1', dateAdded: Date.now() - 90000 },
  { id: 'b3', title: 'Hacker News', url: 'https://news.ycombinator.com', folderId: '1', dateAdded: Date.now() - 80000 },
  { id: 'b4', title: 'Wikipedia, the free encyclopedia', url: 'https://www.wikipedia.org', folderId: '1', dateAdded: Date.now() - 70000 },
  { id: 'b5', title: 'MDN Web Docs', url: 'https://developer.mozilla.org', folderId: '3', dateAdded: Date.now() - 60000 },
  { id: 'b6', title: 'Dribbble - Discover Design', url: 'https://dribbble.com', folderId: '3', dateAdded: Date.now() - 50000 },
];

export const INITIAL_HISTORY: HistoryItem[] = [
  { id: 'h1', title: 'Actra Web Browser', url: 'chrome://newtab', visitTime: Date.now() - 1000 * 60 * 5, visitCount: 12 },
  { id: 'h2', title: 'GitHub: Let’s build from here', url: 'https://github.com', visitTime: Date.now() - 1000 * 60 * 45, visitCount: 8 },
  { id: 'h3', title: 'React – A JavaScript library for building user interfaces', url: 'https://react.dev', visitTime: Date.now() - 1000 * 60 * 120, visitCount: 5 },
  { id: 'h4', title: 'Tailwind CSS - Rapidly build modern websites', url: 'https://tailwindcss.com', visitTime: Date.now() - 1000 * 60 * 300, visitCount: 4 },
  { id: 'h5', title: 'Hacker News', url: 'https://news.ycombinator.com', visitTime: Date.now() - 1000 * 60 * 600, visitCount: 15 },
];

export const INITIAL_DOWNLOADS: DownloadItem[] = [
  {
    id: 'd1',
    filename: 'Actra-Browser-Installer-v1.4.2-universal.dmg',
    url: 'https://actra.browser/downloads/v1.4.2.dmg',
    fileSize: '84.5 MB',
    receivedBytes: 84500000,
    totalBytes: 84500000,
    state: 'completed',
    startTime: Date.now() - 1000 * 60 * 30,
  },
  {
    id: 'd2',
    filename: 'developer-design-system-kit.zip',
    url: 'https://github.com/assets/design-kit.zip',
    fileSize: '14.2 MB',
    receivedBytes: 14200000,
    totalBytes: 14200000,
    state: 'completed',
    startTime: Date.now() - 1000 * 60 * 180,
  }
];

export const SUGGESTED_SITES = [
  { title: 'GitHub', url: 'https://github.com', icon: 'Github', color: 'bg-zinc-900 text-white' },
  { title: 'Hacker News', url: 'https://news.ycombinator.com', icon: 'Flame', color: 'bg-orange-600 text-white' },
  { title: 'Wikipedia', url: 'https://www.wikipedia.org', icon: 'BookOpen', color: 'bg-amber-700 text-white' },
  { title: 'React Dev', url: 'https://react.dev', icon: 'Code', color: 'bg-cyan-600 text-white' },
  { title: 'MDN Web Docs', url: 'https://developer.mozilla.org', icon: 'FileText', color: 'bg-orange-500 text-white' },
  { title: 'Dribbble', url: 'https://dribbble.com', icon: 'Palette', color: 'bg-pink-600 text-white' },
  { title: 'YouTube', url: 'https://youtube.com', icon: 'PlaySquare', color: 'bg-red-600 text-white' },
  { title: 'Substack', url: 'https://substack.com', icon: 'Mail', color: 'bg-amber-600 text-white' },
];
