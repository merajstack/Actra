import React from 'react';
import { BrowserMode } from '../types';

interface SidebarProps {
  currentMode: BrowserMode;
  onSetMode: (mode: BrowserMode) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentMode, onSetMode }) => {
  return (
    <aside className="h-full w-[280px] bg-[#FDFBF7] flex flex-col flex-shrink-0 pt-8" style={{ WebkitAppRegion: 'drag' } as any}>
      {/* Logo */}
      <div className="px-8 pb-4 pt-4 flex items-center gap-3">
        <span className="material-symbols-outlined text-[#a04100] text-[28px]">auto_awesome</span>
        <span className="font-serif font-bold text-2xl text-zinc-900 tracking-tight" style={{ WebkitAppRegion: 'no-drag' } as any}>Actra</span>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-1 mt-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <button
          onClick={() => onSetMode('bookmarks')}
          className={`w-full flex items-center px-4 py-3 rounded-2xl transition-all text-sm font-semibold cursor-pointer border-none text-left
            ${currentMode === 'bookmarks' 
              ? 'bg-[#a04100] text-white shadow-md' 
              : 'text-zinc-600 hover:bg-[#F5F0E6] hover:text-zinc-900'
            }`}
        >
          <span className="material-symbols-outlined mr-4 text-[20px]">bookmarks</span>Bookmarks Manager
        </button>

        <button
          onClick={() => onSetMode('history')}
          className={`w-full flex items-center px-4 py-3 rounded-2xl transition-all text-sm font-semibold cursor-pointer border-none text-left
            ${currentMode === 'history' 
              ? 'bg-[#a04100] text-white shadow-md' 
              : 'text-zinc-600 hover:bg-[#F5F0E6] hover:text-zinc-900'
            }`}
        >
          <span className="material-symbols-outlined mr-4 text-[20px]">history</span>History
        </button>

        <button
          onClick={() => onSetMode('downloads')}
          className={`w-full flex items-center px-4 py-3 rounded-2xl transition-all text-sm font-semibold cursor-pointer border-none text-left
            ${currentMode === 'downloads' 
              ? 'bg-[#a04100] text-white shadow-md' 
              : 'text-zinc-600 hover:bg-[#F5F0E6] hover:text-zinc-900'
            }`}
        >
          <span className="material-symbols-outlined mr-4 text-[20px]">download</span>Downloads
        </button>

        <button
          onClick={() => onSetMode('settings')}
          className={`w-full flex items-center px-4 py-3 rounded-2xl transition-all text-sm font-semibold cursor-pointer border-none text-left
            ${currentMode === 'settings' 
              ? 'bg-[#a04100] text-white shadow-md' 
              : 'text-zinc-600 hover:bg-[#F5F0E6] hover:text-zinc-900'
            }`}
        >
          <span className="material-symbols-outlined mr-4 text-[20px]">settings</span>Settings
        </button>
      </nav>

      {/* Upgrade Banner */}
      <div className="p-6 mb-4" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <div className="bg-[#F5F0E6] rounded-[24px] p-5 flex flex-col gap-4 border border-[#E8E2D5]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Actra Pro</span>
            <span className="material-symbols-outlined text-[#a04100] text-[18px]">verified</span>
          </div>
          <button className="w-full py-2.5 bg-[#a04100] hover:bg-[#853400] text-white rounded-xl text-sm font-bold transition-colors cursor-pointer border-none">
            Upgrade
          </button>
        </div>
      </div>
    </aside>
  );
};
