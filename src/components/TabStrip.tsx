import React from 'react';
import { Tab } from '../types';
import { Plus, X, Pin, VolumeX, Shield, Sparkles } from 'lucide-react';
import { ActraLoader } from './ActraLoader';

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
  isAIPanelOpen?: boolean;
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
  isAIPanelOpen,
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
              className={`group relative flex items-center h-[34px] px-3.5 rounded-t-xl text-xs font-medium cursor-pointer transition-all duration-150 max-w-[240px] min-w-[120px] flex-1 overflow-hidden ${
                isActive
                  ? (tab.isIncognito
                      ? 'bg-zinc-950 text-zinc-100 shadow-sm z-10'
                      : 'bg-[#FDFBF7] text-zinc-800 shadow-sm z-10')
                  : (tab.isIncognito
                      ? 'bg-zinc-900/60 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
                      : 'bg-[#EDE8DF]/50 text-zinc-500 hover:bg-[#DCD4C4]/80 hover:text-zinc-700')
              }`}
            >
              {/* Active tab indicator — solid orange bottom bar */}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-orange-500 rounded-t-full" />
              )}

              {/* Loading bar — animated pulse along bottom edge */}
              {tab.isLoading && (
                <div className="absolute bottom-0 left-0 right-0 h-[2.5px] overflow-hidden rounded-t-full">
                  <div
                    className="h-full bg-orange-500"
                    style={{
                      width: '40%',
                      animation: 'tabLoadingSlide 1.4s ease-in-out infinite',
                    }}
                  />
                </div>
              )}

              {/* Pinned Indicator */}
              {tab.isPinned && (
                <Pin className="w-3 h-3 mr-1.5 text-orange-500 shrink-0 fill-orange-500/20" />
              )}

              {/* Favicon — uses tab.favicon if cached, then Google S2 fallback */}
              <div className="w-4 h-4 mr-2 shrink-0 flex items-center justify-center">
                {tab.isIncognito ? (
                  <Shield className="w-3.5 h-3.5 text-orange-400" />
                ) : tab.url.startsWith('chrome://') ? (
                  <img src="tab-icon.png" alt="" className="w-3.5 h-3.5 object-contain" />
                ) : tab.favicon ? (
                  <img
                    src={tab.favicon}
                    alt=""
                    className="w-3.5 h-3.5 rounded-[2px]"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(tab.url)}&sz=32`}
                    alt=""
                    className="w-3.5 h-3.5 rounded-[2px]"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
              </div>

              {/* Title */}
              <span className={`truncate flex-1 text-left ${isActive ? 'font-semibold' : 'font-normal'}`}>
                {tab.title || (tab.url.startsWith('chrome://') ? 'Actra Start' : tab.url)}
              </span>

              {/* Close button — always visible on active tab, hover-only on inactive */}
              <div className="flex items-center space-x-1 ml-1.5 shrink-0">
                {tab.isMuted && <VolumeX className="w-3 h-3 text-red-400 mr-0.5" />}
                <button
                  onClick={(e) => onCloseTab(tab.id, e)}
                  style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                  className={`w-4 h-4 rounded-full flex items-center justify-center transition-all ${
                    isActive
                      ? 'bg-zinc-200/60 text-zinc-500 hover:bg-zinc-300 hover:text-zinc-800 opacity-80 hover:opacity-100'
                      : 'text-zinc-400 hover:bg-zinc-300/80 hover:text-zinc-700 opacity-0 group-hover:opacity-100'
                  }`}
                  title="Close Tab (Cmd+W)"
                >
                  <X className="w-3 h-3" />
                </button>
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
          className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
            isAIPanelOpen 
              ? 'bg-orange-500 text-white shadow-xs' 
              : 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 border border-orange-500/20'
          }`}
          title={isAIPanelOpen ? "Close Actra AI Sidebar" : "Open Actra AI Sidebar"}
        >
          <Sparkles className={`w-3.5 h-3.5 ${isAIPanelOpen ? 'text-white' : 'text-orange-500'}`} />
          <span>Ask Actra</span>
        </button>
      </div>
    </div>
  );
};
