import React, { useState, useEffect, useRef } from 'react';
import { Tab, Bookmark, HistoryItem, DownloadItem, BrowserMode } from './types';
import { INITIAL_BOOKMARKS, INITIAL_FOLDERS, INITIAL_HISTORY, INITIAL_DOWNLOADS } from './data/mockData';
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

// AI Components
import { AIChat } from './components/ai/AIChat';
import { VoiceCommandBar } from './components/VoiceCommandBar';

// Virtual Cursor
const VirtualCursor = ({ visible, url }: { visible: boolean, url: string }) => {
  if (!visible) return null;
  return (
    <div className="fixed top-[26px] left-[50%] -translate-x-[150px] z-[999999] pointer-events-none flex items-center gap-2 animate-in fade-in zoom-in duration-500">
      <div className="w-5 h-5 bg-blue-500/50 border-2 border-blue-500 rounded-full shadow-[0_0_15px_rgba(59,130,246,0.8)] relative">
        <div className="absolute inset-0 bg-blue-400 rounded-full animate-ping opacity-75"></div>
      </div>
      <div className="bg-zinc-900 text-white text-xs px-2 py-1 rounded-md shadow-lg border border-zinc-700 whitespace-nowrap typing-effect font-mono overflow-hidden">
        {url}
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        .typing-effect {
          display: inline-block;
          overflow: hidden;
          white-space: nowrap;
          animation: typing 1s steps(30, end);
          width: fit-content;
        }
        @keyframes typing {
          from { width: 0 }
          to { width: 100% }
        }
      `}} />
    </div>
  );
};

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
  const [showBookmarksBar, setShowBookmarksBar] = useState(false);

  // AI State
  const [showCommandBar, setShowCommandBar] = useState(false);
  const [showVoiceBar, setShowVoiceBar] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [virtualCursorURL, setVirtualCursorURL] = useState<string | null>(null);

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  const isElectron = !!(window as any).electronAPI;

  // Measure and report UI chrome dimensions to Electron
  const headerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isElectron) return;
    const measure = () => {
      if (headerRef.current) {
        const h = headerRef.current.getBoundingClientRect().height;
        if (typeof (window as any).electronAPI.setUIChromeHeight === 'function') {
          (window as any).electronAPI.setUIChromeHeight(Math.round(h));
        }
      }
    };
    setTimeout(measure, 50);
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isElectron]);

  // Initialize Electron tab
  useEffect(() => {
    if (!isElectron) return;
    (window as any).electronAPI.createTab('chrome://newtab', false).then((tabId: string) => {
      setTabs([{
        id: tabId,
        title: 'Actra Start',
        url: 'chrome://newtab',
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
        zoomLevel: 100,
        isIncognito: false,
      }]);
      setActiveTabId(tabId);
    });
  }, [isElectron]);

  // Electron tab event listeners
  useEffect(() => {
    if (!isElectron) return;
    (window as any).electronAPI.onTabUpdated((data: any) => {
      setTabs(prev => prev.map(t => t.id === data.tabId ? { ...t, ...data } : t));
    });
    (window as any).electronAPI.onTabLoading((data: any) => {
      setTabs(prev => prev.map(t => t.id === data.tabId ? { ...t, isLoading: data.isLoading } : t));
    });
    (window as any).electronAPI.onTabTitle((data: any) => {
      setTabs(prev => prev.map(t => t.id === data.tabId ? { ...t, title: data.title } : t));
    });
    (window as any).electronAPI.onTabFavicon((data: any) => {
      setTabs(prev => prev.map(t => t.id === data.tabId ? { ...t, favicon: data.favicon } : t));
    });
    (window as any).electronAPI.onNewTabCreated((data: any) => {
      const newTab: Tab = {
        id: data.tabId, title: 'New Tab', url: data.url, isLoading: true,
        canGoBack: false, canGoForward: false, zoomLevel: 100, isIncognito: data.isIncognito,
      };
      setTabs(prev => [...prev, newTab]);
      setActiveTabId(data.tabId);
      setBrowserMode('browser');
    });
  }, [isElectron]);

  // Auto-open side panel when AI needs approval or CommandBar dispatches
  useEffect(() => {
    if (isElectron) {
      (window as any).electronAPI.onAIOpenSidePanel(() => {
        const currentTab = tabs.find(t => t.id === activeTabId);
        if (!currentTab?.isIncognito) setShowAIPanel(true);
      });
    }
    const handleOpenPanel = () => {
        const currentTab = tabs.find(t => t.id === activeTabId);
        if (!currentTab?.isIncognito) setShowAIPanel(true);
    };
    window.addEventListener('open-ai-panel', handleOpenPanel);

    if (isElectron) {
      (window as any).electronAPI.onAnimateAddressBarNavigation((data: any) => {
        setVirtualCursorURL(data.url);
        setTimeout(() => setVirtualCursorURL(null), 2500); // hide after animation
      });
    }

    return () => window.removeEventListener('open-ai-panel', handleOpenPanel);
  }, [isElectron]);

  // BrowserView visibility — show native BrowserView only when in browser mode with a real URL
  // BrowserView visibility — show native BrowserView only when in browser mode with a real URL
  useEffect(() => {
    if (!isElectron) return;
    const isInternalPage = activeTab.url.startsWith('chrome://');
    const shouldShowNativeView = browserMode === 'browser' && !isInternalPage;
    (window as any).electronAPI.setVisibility(activeTabId, shouldShowNativeView);
  }, [browserMode, activeTabId, activeTab.url, isElectron]);

  // ── COMMAND PALETTE: Keyboard Shortcuts (IPC from Native Menu) ──
  useEffect(() => {
    if (!isElectron) return;
    const api = (window as any).electronAPI;

    api.onMenuNewTab(() => handleNewTab());
    api.onMenuNewIncognitoTab(() => handleNewTab(true));
    api.onMenuToggleVoice(async () => {
      const isFull = await api.isFullscreen();
      if (isFull) {
        setShowVoiceBar(prev => !prev);
      } else {
        console.warn('Voice Bar is only available in Full Screen mode.');
      }
    });
    api.onMenuCloseTab(() => {
      if (tabs.length > 1) {
        // e.stopPropagation is called inside handleCloseTab, so we must pass a valid mock object or update handleCloseTab
        // Let's just do what handleCloseTab does natively:
        if (isElectron) (window as any).electronAPI.closeTab(activeTabId);
        const nextTabs = tabs.filter(t => t.id !== activeTabId);
        setTabs(nextTabs);
        const nextId = nextTabs[nextTabs.length - 1].id;
        setActiveTabId(nextId);
        if (isElectron) (window as any).electronAPI.setActiveTab(nextId);
      }
    });
    api.onMenuReopenTab(() => handleReopenClosedTab());
    api.onMenuNextTab(() => {
      const idx = tabs.findIndex(t => t.id === activeTabId);
      if (idx !== -1) {
        const next = (idx + 1) % tabs.length;
        setActiveTabId(tabs[next].id);
        if (isElectron) (window as any).electronAPI.setActiveTab(tabs[next].id);
      }
    });
    api.onMenuPrevTab(() => {
      const idx = tabs.findIndex(t => t.id === activeTabId);
      if (idx !== -1) {
        const prev = (idx - 1 + tabs.length) % tabs.length;
        setActiveTabId(tabs[prev].id);
        if (isElectron) (window as any).electronAPI.setActiveTab(tabs[prev].id);
      }
    });
    api.onMenuSelectTab((idx: number) => {
      if (idx >= 0 && idx < tabs.length) {
        setActiveTabId(tabs[idx].id);
        if (isElectron) (window as any).electronAPI.setActiveTab(tabs[idx].id);
      }
    });
    api.onMenuSelectLastTab(() => {
      if (tabs.length > 0) {
        const lastId = tabs[tabs.length - 1].id;
        setActiveTabId(lastId);
        if (isElectron) (window as any).electronAPI.setActiveTab(lastId);
      }
    });
    api.onMenuFocusUrl(() => window.dispatchEvent(new Event('focus-url')));
    api.onMenuBookmark(() => handleToggleBookmark());
    api.onMenuBookmarkAll(() => {
      // Not implemented in React UI yet, but could loop over tabs
      alert('Bookmark all tabs clicked');
    });
    api.onMenuToggleBookmarksBar(() => setShowBookmarksBar(prev => !prev));
    api.onMenuFind(() => setShowFindBar(prev => !prev));
    api.onMenuHistory(() => setBrowserMode('history'));
    api.onMenuDownloads(() => setBrowserMode('downloads'));
    api.onMenuCommandBar(() => setShowCommandBar(prev => !prev));
    
    const handleVoiceDown = () => {
      setShowVoiceBar(true);
    };

    const handleVoiceUp = () => {
      window.dispatchEvent(new Event('stop-voice-recording'));
    };

    if (api.onVoiceShortcutDown) {
      api.onVoiceShortcutDown(handleVoiceDown);
      api.onVoiceShortcutUp(handleVoiceUp);
    }
  }, [isElectron, tabs, activeTabId]);

  // Fallback keyboard shortcuts for Web/Dev mode (non-Electron)
  useEffect(() => {
    if (isElectron) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'n') { e.preventDefault(); handleNewTab(true); }
      else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 't') { e.preventDefault(); handleNewTab(); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'w') { e.preventDefault(); if (tabs.length > 1) handleCloseTab(activeTabId, {} as any); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'r') { e.preventDefault(); handleReload(); }
      else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'i') { e.preventDefault(); setShowDevTools(prev => !prev); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); setShowFindBar(prev => !prev); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); setBrowserMode('history'); }
      else if ((e.metaKey || e.ctrlKey) && e.altKey && e.key.toLowerCase() === 'b') { e.preventDefault(); setBrowserMode('bookmarks'); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); setBrowserMode('downloads'); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l') { e.preventDefault(); window.dispatchEvent(new Event('focus-url')); }
      else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'b') { e.preventDefault(); setShowBookmarksBar(prev => !prev); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setShowCommandBar(prev => !prev); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tabs, activeTabId, isElectron]);

  const handleNewTab = async (isIncognito = false) => {
    if (isElectron) {
      const tabId = await (window as any).electronAPI.createTab('chrome://newtab', isIncognito);
      const newTab: Tab = {
        id: tabId,
        title: isIncognito ? ' Get a good  life bro' : 'Actra Start',
        url: 'chrome://newtab',
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
        zoomLevel: 100,
        isIncognito,
      };
      setTabs(prev => [...prev, newTab]);
      setActiveTabId(tabId);
      setBrowserMode('browser');
    } else {
      const newId = `tab-${Date.now()}`;
      const newTab: Tab = {
        id: newId,
        title: isIncognito ? ' Get a good  life bro' : 'Actra Start',
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
    }
  };

  const handleReopenClosedTab = async () => {
    if (!isElectron) return;
    const result = await (window as any).electronAPI.reopenClosedTab();
    // The backend sends 'new-tab-created' event which is handled by our listener
  };

  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) return;
    if (isElectron) (window as any).electronAPI.closeTab(id);
    const nextTabs = tabs.filter(t => t.id !== id);
    setTabs(nextTabs);
    if (activeTabId === id) {
      const nextId = nextTabs[nextTabs.length - 1].id;
      setActiveTabId(nextId);
      if (isElectron) (window as any).electronAPI.setActiveTab(nextId);
    }
  };

  const handleNavigate = (url: string) => {
    if (url.startsWith('chrome://')) {
      const mode = url.replace('chrome://', '') as BrowserMode;
      if (mode !== 'newtab') {
        setBrowserMode(mode);
        if (isElectron) {
          (window as any).electronAPI.setVisibility(activeTabId, false);
          setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, url: url, title: mode.charAt(0).toUpperCase() + mode.slice(1) } : t));
        }
        return;
      }
    }

    setBrowserMode('browser');
    
    let targetUrl = url;
    if (!url.startsWith('http') && !url.startsWith('chrome://') && url.includes('.')) {
      targetUrl = `https://${url}`;
    } else if (!url.startsWith('http') && !url.startsWith('chrome://')) {
      targetUrl = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
    }

    if (isElectron) {
      (window as any).electronAPI.navigateTab(activeTabId, targetUrl);
      setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, url: targetUrl, isLoading: true } : t));
    } else {
      setTabs(prev => prev.map(t => {
        if (t.id === activeTabId) {
          let title = targetUrl.replace('chrome://', '').replace('https://', '').replace('http://', '');
          return {
            ...t,
            url: targetUrl,
            title,
            canGoBack: true,
            isLoading: true,
          };
        }
        return t;
      }));
      setTimeout(() => {
        setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, isLoading: false } : t));
      }, 400);
    }

    // Add to history
    if (!activeTab.isIncognito) {
      setHistory(prev => [
        {
          id: `h-${Date.now()}`,
          title: targetUrl,
          url: targetUrl,
          visitTime: Date.now(),
          visitCount: 1,
        },
        ...prev
      ]);
    }
  };

  const handleBack = () => {
    if (isElectron) {
      (window as any).electronAPI.goBack(activeTabId);
    } else {
      handleNavigate('chrome://newtab');
    }
  };

  const handleForward = () => {
    if (isElectron) {
      (window as any).electronAPI.goForward(activeTabId);
    }
  };

  const handleReload = () => {
    if (isElectron) {
      (window as any).electronAPI.reload(activeTabId);
    } else {
      setTabs(prev => prev.map(t => {
        if (t.id === activeTabId) {
          return { ...t, isLoading: true };
        }
        return t;
      }));
      setTimeout(() => {
        setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, isLoading: false } : t));
      }, 600);
    }
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
    <div className={`absolute inset-0 w-full h-full flex flex-col overflow-hidden font-sans select-none ${
      activeTab.isIncognito ? 'bg-zinc-950 text-zinc-100' : 'bg-[#FDFBF7] text-zinc-800'
    }`}>
      {/* Browser Chrome Header (Chrome-style top TabStrip + Toolbar + BookmarksBar) */}
      <div ref={headerRef} className="flex flex-col shrink-0 select-none z-30">
        {/* Multi-Tab Strip (Mac Traffic lights sit on the left with pl-[76px]) */}
        <TabStrip
          tabs={tabs}
          activeTabId={activeTabId}
          onSelectTab={(id) => {
            setActiveTabId(id);
            setBrowserMode('browser');
            if (isElectron) (window as any).electronAPI.setActiveTab(id);
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
            if (isElectron) {
              (window as any).electronAPI.duplicateTab(id);
              // Backend sends 'new-tab-created' event which our listener handles
            } else {
              const target = tabs.find(t => t.id === id);
              if (target) {
                const dup: Tab = { ...target, id: `tab-${Date.now()}`, title: `${target.title} (Copy)` };
                setTabs(prev => [...prev, dup]);
              }
            }
          }}
          onOpenAIPanel={() => setShowAIPanel(prev => !prev)}
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
        {(showBookmarksBar || activeTab.url === 'chrome://newtab') && (
          <BookmarksBar
            bookmarks={bookmarks}
            onNavigate={handleNavigate}
            onOpenManager={() => setBrowserMode('bookmarks')}
          />
        )}
      </div>

      {/* Main Content Body */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Find in Page Bar */}
        {showFindBar && <FindInPageBar onClose={() => setShowFindBar(false)} />}

        {/* View Switcher */}
        {browserMode === 'history' || activeTab.url === 'chrome://history' ? (
          <HistoryPage
            history={history}
            onNavigate={handleNavigate}
            onDeleteHistoryItem={(id) => setHistory(prev => prev.filter(h => h.id !== id))}
            onClearAllHistory={() => setHistory([])}
            onBackToBrowser={() => setBrowserMode('browser')}
          />
        ) : browserMode === 'bookmarks' || activeTab.url === 'chrome://bookmarks' ? (
          <BookmarksPage
            bookmarks={bookmarks}
            folders={folders}
            onNavigate={handleNavigate}
            onDeleteBookmark={(id) => setBookmarks(prev => prev.filter(b => b.id !== id))}
            onAddBookmark={(title, url, folderId) => setBookmarks(prev => [{ id: `b-${Date.now()}`, title, url, folderId, dateAdded: Date.now() }, ...prev])}
            onBackToBrowser={() => setBrowserMode('browser')}
          />
        ) : browserMode === 'downloads' || activeTab.url === 'chrome://downloads' ? (
          <DownloadsPage
            downloads={downloads}
            onClearDownloads={() => setDownloads([])}
            onBackToBrowser={() => setBrowserMode('browser')}
          />
        ) : browserMode === 'settings' || activeTab.url === 'chrome://settings' ? (
          <SettingsPage onBackToBrowser={() => setBrowserMode('browser')} />
        ) : browserMode === 'help' || activeTab.url === 'chrome://help' ? (
          <HelpPage onBackToBrowser={() => setBrowserMode('browser')} />
        ) : activeTab.url === 'chrome://newtab' ? (
          <NewTabPage onNavigate={handleNavigate} isIncognito={activeTab.isIncognito || false} />
        ) : isElectron ? (
          // In Electron mode, the native BrowserView renders on top — show nothing here.
          // This prevents the React iframe fallback from interfering with the native renderer.
          <div className="flex-1" />
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

      {/* AI Chat Panel (Floating) */}
      {showAIPanel && !activeTab.isIncognito && (
        <div className="absolute right-4 top-4 bottom-4 z-50">
          <AIChat activeTabId={activeTabId} onClose={() => setShowAIPanel(false)} />
        </div>
      )}
      
      {/* Fallback for Cmd+K command bar shortcut - just opens the chat now */}
      {showCommandBar && (
        <div className="hidden">
          {setTimeout(() => { setShowCommandBar(false); setShowAIPanel(true); }, 0)}
        </div>
      )}

      {showVoiceBar && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 z-[9999]">
          <VoiceCommandBar />
        </div>
      )}

      {/* Virtual Cursor for AI UI Interaction */}
      <VirtualCursor visible={!!virtualCursorURL} url={virtualCursorURL || ''} />
    </div>
  );
}
