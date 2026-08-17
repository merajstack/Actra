import React from 'react';
import { Tab } from '../types';
import { Plus, X, Pin, VolumeX, Shield, Sparkles } from 'lucide-react';

interface TabStripProps {
  tabs: Tab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string, e: React.MouseEvent) => void;
  onNewTab: () => void;
  onTogglePin: (id: string, e: React.MouseEvent) => void;
  onToggleMute: (id: string, e: React.MouseEvent) => void;
  onDuplicateTab: (id: string, e: React.MouseEvent) => void;
  onOpenAIPanel?: () => void;
}

export const TabStrip: React.FC<TabStripProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onTogglePin,
  onToggleMute,
  onDuplicateTab,
  onOpenAIPanel,
}) => {
  return (
    <div 
      className="h-[42px] bg-[#E8E2D5] border-b border-[#D8CFC0] flex items-center pl-[76px] pr-3 select-none overflow-x-auto scrollbar-none relative"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Tabs Container */}
      <div className="flex items-end space-x-1 h-full pt-1.5 flex-1 overflow-x-auto scrollbar-none">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                onDuplicateTab(tab.id, e);
              }}
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              className={`group relative flex items-center h-[34px] px-3.5 rounded-t-xl text-xs font-medium cursor-pointer transition-all max-w-[240px] min-w-[120px] flex-1 ${
                isActive
                  ? (tab.isIncognito ? 'bg-zinc-950 text-orange-500 shadow-xs border-t-2 border-orange-600 z-10' : 'bg-[#FDFBF7] text-zinc-800 shadow-xs border-t-2 border-orange-500 z-10')
                  : (tab.isIncognito ? 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800 hover:text-orange-400' : 'bg-transparent hover:bg-[#DCD4C4]/60 text-zinc-600 hover:text-zinc-900')
              }`}
            >
              {/* Pinned Indicator */}
              {tab.isPinned && (
                <Pin className="w-3 h-3 mr-1.5 text-orange-500 shrink-0 fill-orange-500/20" />
              )}

              {/* Favicon / Icon */}
              <div className="w-4 h-4 mr-2 shrink-0 flex items-center justify-center">
                {tab.isIncognito ? (
                  <Shield className="w-3.5 h-3.5 text-orange-400" />
                ) : tab.url.startsWith('chrome://') ? (
                  <img src="tab-icon.png" alt="" className="w-3.5 h-3.5 object-contain" />
                ) : (
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(tab.url)}&sz=32`}
                    alt=""
                    className="w-3.5 h-3.5 rounded-xs"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                )}
              </div>

              {/* Title */}
              <span className="truncate flex-1 text-left">
                {tab.title || (tab.url.startsWith('chrome://') ? 'Actra Start' : tab.url)}
              </span>

              {/* Action / Close button */}
              <div className="flex items-center space-x-1 ml-1.5 shrink-0">
                {tab.isLoading ? (
                  <div className="w-3 h-3 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    {tab.isMuted && <VolumeX className="w-3 h-3 text-red-500 mr-0.5" />}
                    <button
                      onClick={(e) => onCloseTab(tab.id, e)}
                      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                      className="w-4 h-4 rounded-full hover:bg-zinc-300/80 flex items-center justify-center text-zinc-400 hover:text-zinc-700 transition-colors opacity-0 group-hover:opacity-100"
                      title="Close Tab (Cmd+W)"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {/* New Tab (+) Button */}
        <button
          onClick={onNewTab}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="w-7 h-7 rounded-full hover:bg-[#DCD4C4]/70 text-zinc-600 hover:text-zinc-900 flex items-center justify-center transition-colors mb-1 ml-1 shrink-0 cursor-pointer"
          title="New Tab (Cmd+T)"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Right Side: Ask Actra AI Button */}
      <div 
        className="flex items-center space-x-2 pl-3"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={onOpenAIPanel}
          className="flex items-center space-x-1.5 px-3 py-1 bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 border border-orange-500/20 rounded-full text-xs font-semibold transition-all shadow-xs cursor-pointer"
          title="Open Actra AI Side Panel"
        >
          <Sparkles className="w-3.5 h-3.5 text-orange-500" />
          <span>Ask Actra</span>
        </button>
      </div>
    </div>
  );
};
