import React, { useState, useRef, useEffect } from 'react';
import { 
  ArrowLeft, ArrowRight, RotateCw, Home, Shield, Lock, Star, 
  Download, Settings, Menu, Search, Globe, X, FileText, Sparkles, Plus
} from 'lucide-react';
import { Bookmark, DownloadItem, HistoryItem } from '../types';

interface ToolbarProps {
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  isIncognito: boolean;
  isBookmarked: boolean;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onHome: () => void;
  onNavigate: (url: string) => void;
  onToggleBookmark: () => void;
  onOpenDownloads: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  onOpenBookmarksManager: () => void;
  downloads: DownloadItem[];
  history: HistoryItem[];
  bookmarks: Bookmark[];
}

export const Toolbar: React.FC<ToolbarProps> = ({
  url,
  canGoBack,
  canGoForward,
  isLoading,
  isIncognito,
  isBookmarked,
  onBack,
  onForward,
  onReload,
  onHome,
  onNavigate,
  onToggleBookmark,
  onOpenDownloads,
  onOpenHistory,
  onOpenSettings,
  onOpenBookmarksManager,
  downloads,
  history,
  bookmarks,
}) => {
  const [inputValue, setInputValue] = useState(url);
  const [isFocused, setIsFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showDownloadsPopover, setShowDownloadsPopover] = useState(false);
  const [showSiteInfo, setShowSiteInfo] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInputValue(url);
  }, [url]);

  // Filter history and bookmarks for omnibox autocomplete
  const suggestions = React.useMemo(() => {
    if (!inputValue.trim() || !isFocused) return [];
    const query = inputValue.toLowerCase();
    const results: { type: 'history' | 'bookmark' | 'search'; title: string; url: string }[] = [];

    // Search matches
    results.push({
      type: 'search',
      title: `Search Google for "${inputValue}"`,
      url: `https://www.google.com/search?q=${encodeURIComponent(inputValue)}`
    });

    history.forEach(h => {
      if (h.title.toLowerCase().includes(query) || h.url.toLowerCase().includes(query)) {
        if (!results.some(r => r.url === h.url)) {
          results.push({ type: 'history', title: h.title, url: h.url });
        }
      }
    });

    bookmarks.forEach(b => {
      if (b.title.toLowerCase().includes(query) || b.url.toLowerCase().includes(query)) {
        if (!results.some(r => r.url === b.url)) {
          results.push({ type: 'bookmark', title: b.title, url: b.url });
        }
      }
    });

    return results.slice(0, 6);
  }, [inputValue, isFocused, history, bookmarks]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      setShowSuggestions(false);
      inputRef.current?.blur();
      let target = inputValue.trim();
      if (target.startsWith('chrome://') || target.startsWith('http://') || target.startsWith('https://')) {
        onNavigate(target);
      } else if (target.includes('.') && !target.includes(' ')) {
        onNavigate(`https://${target}`);
      } else {
        onNavigate(`https://www.google.com/search?q=${encodeURIComponent(target)}`);
      }
    }
  };

  const activeDownloadsCount = downloads.filter(d => d.state === 'progressing').length;

  return (
    <div className={`h-12 px-3 flex items-center space-x-2 border-b select-none relative ${
      isIncognito ? 'bg-zinc-900 border-zinc-800 text-zinc-200' : 'bg-[#FDFBF7] border-[#E8E2D5] text-zinc-700'
    }`}>
      {/* Navigation Controls */}
      <div className="flex items-center space-x-1">
        <button
          onClick={onBack}
          disabled={!canGoBack}
          className={`p-1.5 rounded-lg transition-colors ${canGoBack ? 'hover:bg-zinc-200/70 dark:hover:bg-zinc-800 cursor-pointer text-zinc-700 dark:text-zinc-200' : 'opacity-40 cursor-not-allowed text-zinc-400'}`}
          title="Back (Cmd+[)"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <button
          onClick={onForward}
          disabled={!canGoForward}
          className={`p-1.5 rounded-lg transition-colors ${canGoForward ? 'hover:bg-zinc-200/70 dark:hover:bg-zinc-800 cursor-pointer text-zinc-700 dark:text-zinc-200' : 'opacity-40 cursor-not-allowed text-zinc-400'}`}
          title="Forward (Cmd+])"
        >
          <ArrowRight className="w-4 h-4" />
        </button>
        <button
          onClick={onReload}
          className="p-1.5 rounded-lg hover:bg-zinc-200/70 dark:hover:bg-zinc-800 transition-colors cursor-pointer text-zinc-700 dark:text-zinc-200"
          title="Reload (Cmd+R)"
        >
          <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-orange-500' : ''}`} />
        </button>
        <button
          onClick={onHome}
          className="p-1.5 rounded-lg hover:bg-zinc-200/70 dark:hover:bg-zinc-800 transition-colors cursor-pointer text-zinc-700 dark:text-zinc-200"
          title="Home (New Tab)"
        >
          <Home className="w-4 h-4" />
        </button>
      </div>

      {/* Omnibox Address Bar */}
      <div className="relative flex-1">
        <div className={`flex items-center h-9 px-3 rounded-full border transition-all ${
          isFocused 
            ? 'bg-white dark:bg-zinc-950 border-orange-500 ring-2 ring-orange-500/20 shadow-md' 
            : isIncognito ? 'bg-zinc-800 border-zinc-700 text-zinc-200' : 'bg-[#F2ECE1] border-[#E2DAD0] text-zinc-800 hover:bg-[#EFE8DC]'
        }`}>
          {/* SSL Lock / Chrome icon */}
          <button 
            onClick={() => setShowSiteInfo(!showSiteInfo)}
            className="flex items-center space-x-1.5 mr-2 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
            title="View Site Information"
          >
            {url.startsWith('chrome://') ? (
              <Globe className="w-3.5 h-3.5 text-orange-600" />
            ) : url.startsWith('https://') ? (
              <Lock className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Shield className="w-3.5 h-3.5 text-amber-500" />
            )}
          </button>

          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onFocus={() => {
              setIsFocused(true);
              setShowSuggestions(true);
              inputRef.current?.select();
            }}
            onBlur={() => {
              setIsFocused(false);
              setTimeout(() => setShowSuggestions(false), 200);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search with Google or enter address"
            className="w-full bg-transparent text-xs outline-none font-medium truncate"
          />

          {/* Bookmark Star */}
          {!url.startsWith('chrome://') && (
            <button
              onClick={onToggleBookmark}
              className={`p-1 rounded-full transition-colors ml-1 cursor-pointer ${
                isBookmarked ? 'text-orange-500 fill-orange-500' : 'text-zinc-400 hover:text-zinc-700'
              }`}
              title={isBookmarked ? 'Edit bookmark' : 'Bookmark this tab'}
            >
              <Star className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Omnibox Suggestions Dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-10 left-0 right-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl z-50 overflow-hidden py-1">
            {suggestions.map((s, idx) => (
              <div
                key={idx}
                onMouseDown={() => {
                  onNavigate(s.url);
                  setShowSuggestions(false);
                }}
                className="flex items-center px-3 py-2 hover:bg-orange-50 dark:hover:bg-zinc-800/80 cursor-pointer text-xs space-x-2 text-zinc-700 dark:text-zinc-200"
              >
                {s.type === 'search' ? (
                  <Search className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                ) : s.type === 'bookmark' ? (
                  <Star className="w-3.5 h-3.5 text-amber-500 shrink-0 fill-amber-500/20" />
                ) : (
                  <Globe className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                )}
                <div className="truncate flex-1">
                  <div className="font-medium truncate">{s.title}</div>
                  <div className="text-[10px] text-zinc-400 truncate">{s.url}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Site Info Popover */}
        {showSiteInfo && (
          <div className="absolute top-10 left-0 w-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl z-50 p-4 text-xs space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2">
              <span className="font-semibold text-zinc-800 dark:text-zinc-100 flex items-center space-x-1.5">
                <Lock className="w-4 h-4 text-emerald-600" />
                <span>Connection is secure</span>
              </span>
              <button onClick={() => setShowSiteInfo(false)} className="text-zinc-400 hover:text-zinc-700">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-zinc-600 dark:text-zinc-400">
              Your information (for example, passwords or credit card numbers) is private when it is sent to this site.
            </p>
            <div className="bg-zinc-50 dark:bg-zinc-800 p-2.5 rounded-lg space-y-1">
              <div className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">Certificates & Permissions</div>
              <div className="text-zinc-500 dark:text-zinc-400">Valid HTTPS Certificate issued by Actra Trust CA. Cookies: 4 allowed. JavaScript: Allowed.</div>
            </div>
          </div>
        )}
      </div>

      {/* Toolbar Action Icons */}
      <div className="flex items-center space-x-1">
        {/* Downloads Button */}
        <div className="relative">
          <button
            onClick={() => {
              setShowDownloadsPopover(!showDownloadsPopover);
              onOpenDownloads();
            }}
            className="p-2 rounded-lg hover:bg-zinc-200/70 dark:hover:bg-zinc-800 transition-colors relative cursor-pointer text-zinc-700 dark:text-zinc-200"
            title="Downloads"
          >
            <Download className="w-4 h-4" />
            {activeDownloadsCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
            )}
          </button>
        </div>

        {/* Main Menu Button */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 rounded-lg hover:bg-zinc-200/70 dark:hover:bg-zinc-800 transition-colors cursor-pointer text-zinc-700 dark:text-zinc-200"
            title="Actra Menu"
          >
            <Menu className="w-4 h-4" />
          </button>

          {showMenu && (
            <div className="absolute top-10 right-0 w-60 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl z-50 py-1.5 text-xs text-zinc-700 dark:text-zinc-200">
              <div className="px-3 py-1.5 font-semibold text-zinc-400 uppercase tracking-wider text-[10px] border-b border-zinc-100 dark:border-zinc-800 flex items-center space-x-1">
                <Sparkles className="w-3 h-3 text-orange-500" />
                <span>Actra Browser v1.4</span>
              </div>
              <button
                onClick={() => { onOpenBookmarksManager(); setShowMenu(false); }}
                className="w-full text-left px-3 py-2 hover:bg-orange-50 dark:hover:bg-zinc-800 flex items-center justify-between cursor-pointer"
              >
                <span>Bookmarks Manager</span>
                <span className="text-[10px] text-zinc-400">Cmd+Opt+B</span>
              </button>
              <button
                onClick={() => { onOpenHistory(); setShowMenu(false); }}
                className="w-full text-left px-3 py-2 hover:bg-orange-50 dark:hover:bg-zinc-800 flex items-center justify-between cursor-pointer"
              >
                <span>History</span>
                <span className="text-[10px] text-zinc-400">Cmd+Y</span>
              </button>
              <button
                onClick={() => { onOpenDownloads(); setShowMenu(false); }}
                className="w-full text-left px-3 py-2 hover:bg-orange-50 dark:hover:bg-zinc-800 flex items-center justify-between cursor-pointer"
              >
                <span>Downloads</span>
                <span className="text-[10px] text-zinc-400">Cmd+J</span>
              </button>
              <div className="border-t border-zinc-100 dark:border-zinc-800 my-1" />
              <button
                onClick={() => { onOpenSettings(); setShowMenu(false); }}
                className="w-full text-left px-3 py-2 hover:bg-orange-50 dark:hover:bg-zinc-800 flex items-center justify-between cursor-pointer"
              >
                <span>Settings</span>
                <span className="text-[10px] text-zinc-400">Cmd+,</span>
              </button>
              <button
                onClick={() => { onNavigate('chrome://help'); setShowMenu(false); }}
                className="w-full text-left px-3 py-2 hover:bg-orange-50 dark:hover:bg-zinc-800 flex items-center cursor-pointer"
              >
                <span>About Actra & Electron</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
