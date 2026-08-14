import React from 'react';
import { Shield, Sparkles } from 'lucide-react';

interface TitleBarProps {
  isIncognito: boolean;
  windowTitle: string;
}

export const TitleBar: React.FC<TitleBarProps> = ({ isIncognito, windowTitle }) => {
  return (
    <div className={`h-9 px-3 flex items-center justify-between select-none ${
      isIncognito ? 'bg-zinc-900 text-zinc-200 border-b border-zinc-800' : 'bg-[#F5F0E6] text-zinc-700 border-b border-[#E8E2D5]'
    }`}>
      {/* macOS Traffic Lights */}
      <div className="flex items-center space-x-2 w-28">
        <button 
          className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E] hover:opacity-90 flex items-center justify-center group cursor-pointer transition-all"
          title="Close Window"
          onClick={() => alert('Actra window close simulated')}
        >
          <span className="text-[8px] text-zinc-800 opacity-0 group-hover:opacity-100 font-bold">×</span>
        </button>
        <button 
          className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123] hover:opacity-90 flex items-center justify-center group cursor-pointer transition-all"
          title="Minimize"
          onClick={() => alert('Actra window minimize simulated')}
        >
          <span className="text-[8px] text-zinc-800 opacity-0 group-hover:opacity-100 font-bold">-</span>
        </button>
        <button 
          className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29] hover:opacity-90 flex items-center justify-center group cursor-pointer transition-all"
          title="Zoom / Fullscreen"
          onClick={() => alert('Actra window maximize simulated')}
        >
          <span className="text-[8px] text-zinc-800 opacity-0 group-hover:opacity-100 font-bold">+</span>
        </button>
      </div>

      {/* Center Title / Incognito badge */}
      <div className="flex items-center space-x-2 text-xs font-medium truncate max-w-md">
        {isIncognito && (
          <span className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-zinc-800 text-orange-400 text-[10px] font-semibold border border-zinc-700">
            <Shield className="w-3 h-3" />
            <span>Incognito</span>
          </span>
        )}
        <span className="truncate">{windowTitle || 'Actra Browser'}</span>
      </div>

      {/* Right side badge */}
      <div className="w-28 flex justify-end items-center space-x-1.5">
        <span className="text-[11px] font-semibold tracking-wider text-orange-600 dark:text-orange-400 flex items-center space-x-1 bg-orange-100/60 dark:bg-orange-950/40 px-2 py-0.5 rounded-full border border-orange-200/50">
          <Sparkles className="w-3 h-3" />
          <span>Actra v1.4</span>
        </span>
      </div>
    </div>
  );
};
