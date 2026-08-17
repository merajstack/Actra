import React from 'react';
import { Shield, Sparkles } from 'lucide-react';

interface TitleBarProps {
  isIncognito: boolean;
  windowTitle: string;
}

export const TitleBar: React.FC<TitleBarProps> = ({ isIncognito, windowTitle }) => {
  return (
    <div className={`h-[38px] flex items-center justify-between px-4 select-none ${
      isIncognito ? 'bg-black text-orange-500 border-b border-orange-900' : 'bg-[#F5F0E6] text-zinc-700 border-b border-[#E8E2D5]'
    }`} style={{ WebkitAppRegion: 'drag' } as any}>
      {/* Left side spacer to balance center title (since traffic lights were removed) */}
      <div className="w-28"></div>

      {/* Center Title / Incognito badge */}
      <div className="flex items-center space-x-2 text-xs font-medium truncate max-w-md">
        {isIncognito && (
          <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-orange-900/50 text-orange-400 border border-orange-800">
            <Shield className="w-3.5 h-3.5" />
            <span>Get a good life bro</span>
          </div>
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
