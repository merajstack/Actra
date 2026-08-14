import React, { useState, useEffect } from 'react';
import { Tab, Bookmark, HistoryItem, DownloadItem, BrowserMode } from './types';
import { INITIAL_BOOKMARKS, INITIAL_FOLDERS, INITIAL_HISTORY, INITIAL_DOWNLOADS } from './data/mockData';
import { TitleBar } from './components/TitleBar';
import { TabStrip } from './components/TabStrip';
import { Toolbar } from './components/Toolbar';
import { BookmarksBar } from './components/BookmarksBar';
import { NewTabPage } from './components/NewTabPage';
import { HistoryPage } from './components/HistoryPage';
import { BookmarksPage } from './components/BookmarksPage';
import { DownloadsPage } from './components/DownloadsPage';
import { SettingsPage } from './components/SettingsPage';
import { HelpPage } from './components/HelpPage';
import { DevToolsPanel } from './components/DevToolsPanel';
import { FindInPageBar } from './components/FindInPageBar';
import { BrowserContent } from './components/BrowserContent';

export default function App() {
  const [tabs, setTabs] = useState<Tab[]>([
    {
      id: 'tab-1',
      title: 'Actra Start',
      url: 'chrome://newtab',
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      zoomLevel: 100,
      isIncognito: false,
    }
  ]);
  const [activeTabId, setActiveTabId] = useState('tab-1');
  const [browserMode, setBrowserMode] = useState<BrowserMode>('browser');
  
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(INITIAL_BOOKMARKS);
  const [folders, setFolders] = useState(INITIAL_FOLDERS);
  const [history, setHistory] = useState<HistoryItem[]>(INITIAL_HISTORY);
  const [downloads, setDownloads] = useState<DownloadItem[]>(INITIAL_DOWNLOADS);

  const [showDevTools, setShowDevTools] = useState(false);
  const [showFindBar, setShowFindBar] = useState(false);

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  // Keyboard Shortcuts (Cmd+T, Cmd+W, Cmd+R, Cmd+Shift+I, Cmd+F, Cmd+Y, etc.)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        handleNewTab();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        if (tabs.length > 1) {
          handleCloseTab(activeTabId, {} as any);
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        handleReload();
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        setShowDevTools(prev => !prev);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setShowFindBar(prev => !prev);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        setBrowserMode('history');
      } else if ((e.metaKey || e.ctrlKey) && e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setBrowserMode('bookmarks');
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setBrowserMode('downloads');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tabs, activeTabId]);

  const handleNewTab = (isIncognito = false) => {
    const newId = `tab-${Date.now()}`;
    const newTab: Tab = {
      id: newId,
      title: isIncognito ? 'Incognito Tab' : 'Actra Start',
      url: 'chrome://newtab',
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      zoomLevel: 100,
      isIncognito,
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newId);
    setBrowserMode('browser');
  };

  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) return; // Keep at least one tab
    const nextTabs = tabs.filter(t => t.id !== id);
    setTabs(nextTabs);
    if (activeTabId === id) {
      setActiveTabId(nextTabs[nextTabs.length - 1].id);
    }
  };

  const handleNavigate = (url: string) => {
    setBrowserMode('browser');
    setTabs(prev => prev.map(t => {
      if (t.id === activeTabId) {
        let title = url.replace('chrome://', '');
        if (url.includes('github.com')) title = 'GitHub';
        else if (url.includes('news.ycombinator.com')) title = 'Hacker News';
        else if (url.includes('wikipedia.org')) title = 'Wikipedia';
        else if (url.includes('google.com')) title = 'Google Search';

        return {
          ...t,
          url,
          title: title.charAt(0).toUpperCase() + title.slice(1),
          canGoBack: true,
          isLoading: true,
        };
      }
      return t;
    }));

    // Add to history
    setTimeout(() => {
      setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, isLoading: false } : t));
      setHistory(prev => [
        {
          id: `h-${Date.now()}`,
          title: url,
          url,
          visitTime: Date.now(),
          visitCount: 1,
        },
        ...prev
      ]);
    }, 400);
  };

  const handleBack = () => {
    handleNavigate('chrome://newtab');
  };

  const handleForward = () => {
    // Forward navigation simulation
  };

  const handleReload = () => {
    setTabs(prev => prev.map(t => {
      if (t.id === activeTabId) {
        return { ...t, isLoading: true };
      }
      return t;
    }));
    setTimeout(() => {
      setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, isLoading: false } : t));
    }, 600);
  };

  const handleHome = () => {
    handleNavigate('chrome://newtab');
  };

  const handleToggleBookmark = () => {
    const currentUrl = activeTab.url;
    if (currentUrl.startsWith('chrome://')) return;
    const exists = bookmarks.some(b => b.url === currentUrl);
    if (exists) {
      setBookmarks(prev => prev.filter(b => b.url !== currentUrl));
    } else {
      setBookmarks(prev => [
        {
          id: `b-${Date.now()}`,
          title: activeTab.title,
          url: currentUrl,
          folderId: '1',
          dateAdded: Date.now(),
        },
        ...prev
      ]);
    }
  };

  const isBookmarked = bookmarks.some(b => b.url === activeTab.url);

  return (
    <div className={`w-screen h-screen flex flex-col overflow-hidden font-sans select-none ${
      activeTab.isIncognito ? 'bg-zinc-950 text-zinc-100' : 'bg-[#FDFBF7] text-zinc-800'
    }`}>
      {/* macOS Title Bar */}
      <TitleBar isIncognito={activeTab.isIncognito || false} windowTitle={activeTab.title} />

      {/* Multi-Tab Strip */}
      <TabStrip
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={(id) => {
          setActiveTabId(id);
          setBrowserMode('browser');
        }}
        onCloseTab={handleCloseTab}
        onNewTab={() => handleNewTab(false)}
        onTogglePin={(id, e) => {
          e.stopPropagation();
          setTabs(prev => prev.map(t => t.id === id ? { ...t, isPinned: !t.isPinned } : t));
        }}
        onToggleMute={(id, e) => {
          e.stopPropagation();
          setTabs(prev => prev.map(t => t.id === id ? { ...t, isMuted: !t.isMuted } : t));
        }}
        onDuplicateTab={(id, e) => {
          e.stopPropagation();
          const target = tabs.find(t => t.id === id);
          if (target) {
            const dup: Tab = { ...target, id: `tab-${Date.now()}`, title: `${target.title} (Copy)` };
            setTabs(prev => [...prev, dup]);
          }
        }}
      />

      {/* Navigation Toolbar */}
      <Toolbar
        url={activeTab.url}
        canGoBack={activeTab.canGoBack}
        canGoForward={activeTab.canGoForward}
        isLoading={activeTab.isLoading}
        isIncognito={activeTab.isIncognito || false}
        isBookmarked={isBookmarked}
        onBack={handleBack}
        onForward={handleForward}
        onReload={handleReload}
        onHome={handleHome}
        onNavigate={handleNavigate}
        onToggleBookmark={handleToggleBookmark}
        onOpenDownloads={() => setBrowserMode('downloads')}
        onOpenHistory={() => setBrowserMode('history')}
        onOpenSettings={() => setBrowserMode('settings')}
        onOpenBookmarksManager={() => setBrowserMode('bookmarks')}
        downloads={downloads}
        history={history}
        bookmarks={bookmarks}
      />

      {/* Bookmarks Bar */}
      <BookmarksBar
        bookmarks={bookmarks}
        onNavigate={handleNavigate}
        onOpenManager={() => setBrowserMode('bookmarks')}
      />

      {/* Main Content Body */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Find in Page Bar */}
        {showFindBar && <FindInPageBar onClose={() => setShowFindBar(false)} />}

        {/* View Switcher */}
        {browserMode === 'history' ? (
          <HistoryPage
            history={history}
            onNavigate={handleNavigate}
            onDeleteHistoryItem={(id) => setHistory(prev => prev.filter(h => h.id !== id))}
            onClearAllHistory={() => setHistory([])}
            onBackToBrowser={() => setBrowserMode('browser')}
          />
        ) : browserMode === 'bookmarks' ? (
          <BookmarksPage
            bookmarks={bookmarks}
            folders={folders}
            onNavigate={handleNavigate}
            onDeleteBookmark={(id) => setBookmarks(prev => prev.filter(b => b.id !== id))}
            onAddBookmark={(title, url, folderId) => setBookmarks(prev => [{ id: `b-${Date.now()}`, title, url, folderId, dateAdded: Date.now() }, ...prev])}
            onBackToBrowser={() => setBrowserMode('browser')}
          />
        ) : browserMode === 'downloads' ? (
          <DownloadsPage
            downloads={downloads}
            onClearDownloads={() => setDownloads([])}
            onBackToBrowser={() => setBrowserMode('browser')}
          />
        ) : browserMode === 'settings' ? (
          <SettingsPage onBackToBrowser={() => setBrowserMode('browser')} />
        ) : browserMode === 'help' ? (
          <HelpPage onBackToBrowser={() => setBrowserMode('browser')} />
        ) : activeTab.url === 'chrome://newtab' ? (
          <NewTabPage onNavigate={handleNavigate} />
        ) : (
          <BrowserContent
            url={activeTab.url}
            zoomLevel={activeTab.zoomLevel}
            isIncognito={activeTab.isIncognito || false}
            onNavigate={handleNavigate}
          />
        )}

        {/* Chromium DevTools Panel Drawer */}
        {showDevTools && (
          <DevToolsPanel
            currentUrl={activeTab.url}
            onClose={() => setShowDevTools(false)}
          />
        )}
      </div>
    </div>
  );
}
