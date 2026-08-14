import React from 'react';
import { Tab } from '../types';
import { Plus, X, Pin, VolumeX, Globe, Shield, MoreHorizontal } from 'lucide-react';

interface TabStripProps {
  tabs: Tab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string, e: React.MouseEvent) => void;
  onNewTab: () => void;
  onTogglePin: (id: string, e: React.MouseEvent) => void;
  onToggleMute: (id: string, e: React.MouseEvent) => void;
  onDuplicateTab: (id: string, e: React.MouseEvent) => void;
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
}) => {
  return (
    <div className="h-10 bg-[#EDE8DC] border-b border-[#DCD5C5] flex items-center px-2 space-x-1 overflow-x-auto select-none scrollbar-none">
      <div className="flex items-center space-x-1 flex-1 overflow-x-auto py-1">
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
              className={`group relative flex items-center h-8 px-3 rounded-t-lg text-xs font-medium cursor-pointer transition-all max-w-[200px] min-w-[120px] ${
                isActive
                  ? 'bg-[#FDFBF7] text-zinc-800 shadow-sm border-t-2 border-orange-500 z-10'
                  : 'bg-[#E5DFD1] hover:bg-[#EBE5D8] text-zinc-600 border-t border-transparent'
              } ${tab.isIncognito ? 'bg-zinc-800 text-zinc-200' : ''}`}
            >
              {/* Pinned Indicator */}
              {tab.isPinned && (
                <Pin className="w-3 h-3 mr-1.5 text-orange-500 shrink-0 fill-orange-500/20" />
              )}

              {/* Favicon or Icon */}
              <div className="w-4 h-4 mr-2 shrink-0 flex items-center justify-center">
                {tab.isIncognito ? (
                  <Shield className="w-3.5 h-3.5 text-orange-400" />
                ) : tab.url.startsWith('chrome://') ? (
                  <Globe className="w-3.5 h-3.5 text-orange-600" />
                ) : (
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(tab.url)}&sz=32`}
                    alt=""
                    className="w-3.5 h-3.5 rounded-sm"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                )}
              </div>

              {/* Title */}
              <span className="truncate flex-1 text-left">
                {tab.title || (tab.url.startsWith('chrome://') ? tab.url.replace('chrome://', '') : tab.url)}
              </span>

              {/* Loading spinner or Action buttons */}
              <div className="flex items-center space-x-1 ml-2 shrink-0">
                {tab.isLoading ? (
                  <div className="w-3 h-3 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    {tab.isMuted && <VolumeX className="w-3 h-3 text-red-500 mr-0.5" />}
                    <button
                      onClick={(e) => onCloseTab(tab.id, e)}
                      className="w-4 h-4 rounded-full hover:bg-zinc-300 dark:hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-zinc-700 transition-colors opacity-60 group-hover:opacity-100"
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
      </div>

      {/* New Tab Button (+) */}
      <button
        onClick={onNewTab}
        className="w-7 h-7 rounded-md bg-[#E2DBD0] hover:bg-[#D7CEBE] text-zinc-700 flex items-center justify-center transition-colors shadow-sm ml-1 shrink-0 cursor-pointer"
        title="New Tab (Cmd+T)"
      >
        <Plus className="w-4 h-4 text-zinc-700" />
      </button>
    </div>
  );
};
