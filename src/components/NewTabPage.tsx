import React, { useState, useEffect } from 'react';
import { Search, Sparkles, Plus, X, Globe, MoreVertical, Edit2, Trash2 } from 'lucide-react';

interface Shortcut {
  id: string;
  title: string;
  url: string;
}

const DEFAULT_SHORTCUTS: Shortcut[] = [
  { id: '1', title: 'GitHub', url: 'https://github.com' },
  { id: '2', title: 'YouTube', url: 'https://youtube.com' },
  { id: '3', title: 'Gmail', url: 'https://mail.google.com' },
  { id: '4', title: 'Hacker News', url: 'https://news.ycombinator.com' },
  { id: '5', title: 'Wikipedia', url: 'https://wikipedia.org' },
];

interface NewTabPageProps {
  onNavigate: (url: string) => void;
  isIncognito?: boolean;
}

export const NewTabPage: React.FC<NewTabPageProps> = ({ onNavigate, isIncognito }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [shortcuts, setShortcuts] = useState<Shortcut[]>(() => {
    const saved = localStorage.getItem('actra_shortcuts');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse shortcuts', e);
      }
    }
    return DEFAULT_SHORTCUTS;
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingShortcut, setEditingShortcut] = useState<Shortcut | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');

  useEffect(() => {
    localStorage.setItem('actra_shortcuts', JSON.stringify(shortcuts));
  }, [shortcuts]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    if (searchQuery.includes('.') && !searchQuery.includes(' ')) {
      onNavigate(searchQuery.startsWith('http') ? searchQuery : `https://${searchQuery}`);
    } else {
      onNavigate(`https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  const openAddModal = () => {
    setEditingShortcut(null);
    setNewTitle('');
    setNewUrl('');
    setIsModalOpen(true);
  };

  const openEditModal = (s: Shortcut, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingShortcut(s);
    setNewTitle(s.title);
    setNewUrl(s.url);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setShortcuts((prev) => prev.filter((s) => s.id !== id));
  };

  const handleSaveShortcut = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim()) return;

    let formattedUrl = newUrl.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    const title = newTitle.trim() || new URL(formattedUrl).hostname.replace('www.', '');

    if (editingShortcut) {
      setShortcuts((prev) =>
        prev.map((s) => (s.id === editingShortcut.id ? { ...s, title, url: formattedUrl } : s))
      );
    } else {
      const newShortcut: Shortcut = {
        id: Date.now().toString(),
        title,
        url: formattedUrl,
      };
      setShortcuts((prev) => [...prev, newShortcut]);
    }

    setIsModalOpen(false);
  };

  if (isIncognito) {
    return (
      <div className="flex-1 bg-zinc-950 flex flex-col items-center justify-center p-8 select-none overflow-y-auto relative text-zinc-100">
        <div className="w-full max-w-2xl flex flex-col items-center space-y-8 my-auto">
          {/* Logo & Title */}
          <div className="flex flex-col items-center space-y-4">
            <Globe className="w-24 h-24 text-orange-500 mb-2 opacity-80" />
            <h1 className="text-3xl font-bold text-orange-500 tracking-wide">Get a good life bro</h1>
            <p className="text-sm text-zinc-400 font-medium text-center max-w-md">
              You've gone incognito. No activity monitoring and no access to Actra AI in this tab.
            </p>
          </div>

          {/* Search Omnibox */}
          <form onSubmit={handleSearch} className="w-full relative mt-8">
            <div className="flex items-center h-13 px-4 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-lg focus-within:border-orange-500 focus-within:ring-4 focus-within:ring-orange-500/20 transition-all">
              <Search className="w-5 h-5 text-orange-500 mr-3 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Google or type a URL..."
                className="w-full bg-transparent text-sm text-zinc-200 outline-none font-medium"
                autoFocus
              />
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-[#FDFBF7] flex flex-col items-center justify-center p-8 select-none overflow-y-auto relative">
      <div className="w-full max-w-2xl flex flex-col items-center space-y-8 my-auto">
        {/* Logo & Title */}
        <div className="flex flex-col items-center space-y-4">
          <img src="logo.png" alt="Actra AI Logo" className="h-24 object-contain drop-shadow-md" />
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

        {/* 1 Row of Chrome-style Shortcuts */}
        <div className="w-full flex items-center justify-center gap-4 flex-wrap pt-2">
          {shortcuts.map((shortcut) => {
            let domain = '';
            try {
              domain = new URL(shortcut.url).hostname;
            } catch {
              domain = shortcut.url;
            }

            return (
              <div
                key={shortcut.id}
                onClick={() => onNavigate(shortcut.url)}
                className="group relative flex flex-col items-center w-20 p-2.5 rounded-xl hover:bg-[#F3ECE0] transition-colors cursor-pointer"
              >
                {/* Delete button on hover */}
                <button
                  onClick={(e) => handleDelete(shortcut.id, e)}
                  title="Remove shortcut"
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-zinc-200 hover:bg-red-100 text-zinc-500 hover:text-red-600 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all z-10 shadow-xs"
                >
                  <X className="w-3 h-3" />
                </button>

                {/* Circular Icon badge */}
                <div className="w-12 h-12 rounded-full bg-white shadow-xs border border-[#E7DECة border-[#E8E1D5] flex items-center justify-center mb-2 group-hover:scale-105 transition-transform overflow-hidden">
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
                    alt={shortcut.title}
                    onError={(e) => {
                      // Fallback icon if favicon fails
                      (e.target as HTMLElement).style.display = 'none';
                      const parent = (e.target as HTMLElement).parentElement;
                      if (parent && !parent.querySelector('.fallback-icon')) {
                        const icon = document.createElement('span');
                        icon.className = 'material-symbols-outlined text-orange-600 text-xl fallback-icon';
                        icon.textContent = 'globe';
                        parent.appendChild(icon);
                      }
                    }}
                    className="w-6 h-6 object-contain"
                  />
                </div>

                {/* Shortcut Title */}
                <span className="text-xs text-zinc-700 font-medium truncate w-full text-center group-hover:text-zinc-900">
                  {shortcut.title}
                </span>
              </div>
            );
          })}

          {/* Add Shortcut Tile */}
          {shortcuts.length < 8 && (
            <button
              onClick={openAddModal}
              className="group flex flex-col items-center w-20 p-2.5 rounded-xl hover:bg-[#F3ECE0] transition-colors cursor-pointer"
            >
              <div className="w-12 h-12 rounded-full bg-white/80 shadow-xs border border-dashed border-[#D5C9B5] group-hover:border-orange-500 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                <Plus className="w-5 h-5 text-zinc-500 group-hover:text-orange-600 transition-colors" />
              </div>
              <span className="text-xs text-zinc-500 font-medium truncate w-full text-center group-hover:text-zinc-800">
                Add shortcut
              </span>
            </button>
          )}
        </div>

        {/* Footer info */}
        <div className="text-center text-xs text-zinc-400 pt-6 border-t border-[#EFE8DC] w-full flex items-center justify-center space-x-2">
          <Sparkles className="w-3.5 h-3.5 text-orange-500" />
          <span>Powered by Electron Chromium & V8 • Warm macOS Experience</span>
        </div>
      </div>

      {/* Add / Edit Shortcut Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-[#E2DAD0] rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-800">
                {editingShortcut ? 'Edit shortcut' : 'Add shortcut'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 cursor-pointer p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveShortcut} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Name</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. YouTube"
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-zinc-50 border border-zinc-200 focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 outline-none transition-all text-zinc-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1.5">URL</label>
                <input
                  type="text"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="e.g. https://youtube.com"
                  required
                  autoFocus
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-zinc-50 border border-zinc-200 focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 outline-none transition-all text-zinc-800"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
