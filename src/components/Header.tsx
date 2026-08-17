import React, { useRef, useState } from 'react';
import { DownloadItem, HistoryItem, Bookmark } from '../types';

interface HeaderProps {
  url: string;
  onNavigate: (url: string) => void;
  onOpenCommandBar: () => void;
}

export const Header: React.FC<HeaderProps> = ({ url, onNavigate, onOpenCommandBar }) => {
  const [inputValue, setInputValue] = useState(url);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
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

  return (
    <header className="h-16 flex items-center px-8 justify-between gap-6 w-full shrink-0" style={{ WebkitAppRegion: 'drag' } as any}>
      
      {/* Omnibox Address Bar */}
      <div className="flex-1 max-w-2xl flex items-center bg-[#F5F0E6] rounded-full px-5 py-2 border border-transparent hover:border-[#E8E2D5] focus-within:border-[#E8E2D5] focus-within:bg-white transition-all gap-3" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <span className="material-symbols-outlined text-[18px] text-zinc-400">
          {url.startsWith('https') ? 'lock' : 'public'}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setInputValue(url)}
          className="flex-1 bg-transparent border-none outline-none text-sm text-zinc-700"
        />
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-6" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <button 
          onClick={onOpenCommandBar}
          className="flex items-center gap-2 bg-[#ff6600] hover:bg-[#e65c00] text-white px-5 py-2 rounded-full text-sm font-bold shadow-md shadow-[#ff6600]/20 transition-all cursor-pointer border-none"
        >
          <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
          Ask Actra
        </button>
        
        {/* Window Controls (Simulated for design parity) */}
        <div className="flex items-center gap-3 px-4 border-l border-[#E8E2D5]">
          <span className="material-symbols-outlined text-zinc-400 cursor-pointer hover:text-zinc-700 text-[20px]">remove</span>
          <span className="material-symbols-outlined text-zinc-400 cursor-pointer hover:text-zinc-700 text-[18px]">crop_square</span>
          <span className="material-symbols-outlined text-red-500 cursor-pointer text-[20px]">close</span>
        </div>
        
        {/* Profile Avatar */}
        <div className="w-8 h-8 rounded-full bg-[#a04100] flex items-center justify-center cursor-pointer shadow-sm">
          <span className="material-symbols-outlined text-white text-[18px]">person</span>
        </div>
      </div>
    </header>
  );
};
