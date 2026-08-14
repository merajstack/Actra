import React, { useState } from 'react';
import { Search, Sparkles, Github, Flame, BookOpen, Code, FileText, Palette, PlaySquare, Mail, Globe, Plus } from 'lucide-react';
import { SUGGESTED_SITES } from '../data/mockData';

interface NewTabPageProps {
  onNavigate: (url: string) => void;
}

export const NewTabPage: React.FC<NewTabPageProps> = ({ onNavigate }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    if (searchQuery.includes('.') && !searchQuery.includes(' ')) {
      onNavigate(searchQuery.startsWith('http') ? searchQuery : `https://${searchQuery}`);
    } else {
      onNavigate(`https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  return (
    <div className="flex-1 bg-[#FDFBF7] flex flex-col items-center justify-center p-8 select-none overflow-y-auto">
      <div className="w-full max-w-2xl flex flex-col items-center space-y-8 my-auto">
        {/* Logo & Title */}
        <div className="flex flex-col items-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-xl shadow-orange-500/20 text-white font-black text-2xl">
            A
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-800 font-serif">Actra</h1>
          <p className="text-xs text-zinc-500 font-medium">Blazing fast Chromium-powered desktop browser for macOS</p>
        </div>

        {/* Search Omnibox */}
        <form onSubmit={handleSearch} className="w-full relative">
          <div className="flex items-center h-13 px-4 rounded-2xl bg-white border border-[#E2DAD0] shadow-lg shadow-zinc-200/50 hover:border-orange-400 focus-within:border-orange-500 focus-within:ring-4 focus-within:ring-orange-500/10 transition-all">
            <Search className="w-5 h-5 text-orange-500 mr-3 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Google or type a URL..."
              className="w-full bg-transparent text-sm text-zinc-800 outline-none font-medium"
              autoFocus
            />
            <span className="text-[11px] font-semibold text-zinc-400 bg-zinc-100 px-2 py-1 rounded-md border border-zinc-200 shrink-0">
              Return ↵
            </span>
          </div>
        </form>

        {/* Quick Launch Tiles */}
        <div className="w-full">
          <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3 px-1">Frequent Shortcuts</div>
          <div className="grid grid-cols-4 gap-3">
            {SUGGESTED_SITES.map((site, idx) => (
              <button
                key={idx}
                onClick={() => onNavigate(site.url)}
                className="group flex flex-col items-center justify-center p-4 rounded-xl bg-white border border-[#EBE5D8] hover:border-orange-300 hover:shadow-md transition-all cursor-pointer space-y-2"
              >
                <div className={`w-10 h-10 rounded-xl ${site.color} flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform`}>
                  <Globe className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium text-zinc-700 truncate w-full text-center">
                  {site.title}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center text-xs text-zinc-400 pt-6 border-t border-[#EFE8DC] w-full flex items-center justify-center space-x-2">
          <Sparkles className="w-3.5 h-3.5 text-orange-500" />
          <span>Powered by Electron Chromium & V8 • Warm macOS Experience</span>
        </div>
      </div>
    </div>
  );
};
