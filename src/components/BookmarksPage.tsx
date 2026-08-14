import React, { useState } from 'react';
import { Bookmark, BookmarkFolder } from '../types';
import { Search, Star, Folder, Trash2, ArrowLeft, Plus, Download, Upload } from 'lucide-react';

interface BookmarksPageProps {
  bookmarks: Bookmark[];
  folders: BookmarkFolder[];
  onNavigate: (url: string) => void;
  onDeleteBookmark: (id: string) => void;
  onAddBookmark: (title: string, url: string, folderId: string) => void;
  onBackToBrowser: () => void;
}

export const BookmarksPage: React.FC<BookmarksPageProps> = ({
  bookmarks,
  folders,
  onNavigate,
  onDeleteBookmark,
  onAddBookmark,
  onBackToBrowser,
}) => {
  const [selectedFolderId, setSelectedFolderId] = useState<string>('1');
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');

  const filteredBookmarks = bookmarks.filter(b => {
    const matchesFolder = b.folderId === selectedFolderId;
    const matchesSearch = b.title.toLowerCase().includes(search.toLowerCase()) || b.url.toLowerCase().includes(search.toLowerCase());
    return search ? matchesSearch : matchesFolder;
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newUrl) return;
    onAddBookmark(newTitle, newUrl.startsWith('http') ? newUrl : `https://${newUrl}`, selectedFolderId);
    setNewTitle('');
    setNewUrl('');
    setShowAddModal(false);
  };

  const exportHtml = () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n` +
      bookmarks.map(b => `    <DT><A HREF="${b.url}" ADD_DATE="${b.dateAdded}">${b.title}</A>\n`).join('') +
      `</DL><p>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'actra-bookmarks.html';
    a.click();
  };

  return (
    <div className="flex-1 bg-[#FDFBF7] flex flex-col overflow-hidden select-none">
      {/* Header */}
      <div className="bg-white border-b border-[#E8E2D5] px-8 py-6 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBackToBrowser}
            className="p-2 rounded-xl bg-[#F5F0E6] hover:bg-[#EAE4D6] text-zinc-700 transition-colors cursor-pointer"
            title="Back to Browser"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-zinc-800 font-serif">Bookmarks Manager</h1>
            <p className="text-xs text-zinc-500">Organize and sync your saved web pages</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="relative w-60">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search bookmarks..."
              className="w-full bg-[#F5F0E6] border border-[#E2DAD0] rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-800 outline-none focus:border-orange-500"
            />
          </div>
          <button
            onClick={exportHtml}
            className="flex items-center space-x-1 px-3 py-2 rounded-xl bg-[#F5F0E6] hover:bg-[#EAE4D6] text-zinc-700 font-medium text-xs transition-colors cursor-pointer border border-[#E2DAD0]"
            title="Export Bookmarks as HTML"
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center space-x-1 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs transition-colors cursor-pointer shadow-md shadow-orange-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>Add Bookmark</span>
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Folders */}
        <div className="w-64 bg-[#F5F0E6] border-r border-[#E8E2D5] p-4 space-y-1.5 shrink-0 overflow-y-auto">
          <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-3 mb-2">Folders</div>
          {folders.map(folder => {
            const isSelected = selectedFolderId === folder.id && !search;
            return (
              <button
                key={folder.id}
                onClick={() => { setSelectedFolderId(folder.id); setSearch(''); }}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                  isSelected ? 'bg-orange-600 text-white shadow-sm' : 'hover:bg-[#EAE4D6] text-zinc-700'
                }`}
              >
                <Folder className="w-4 h-4" />
                <span className="truncate">{folder.title}</span>
              </button>
            );
          })}
        </div>

        {/* Bookmarks Grid / List */}
        <div className="flex-1 p-8 overflow-y-auto">
          <div className="grid grid-cols-3 gap-4">
            {filteredBookmarks.map(b => (
              <div
                key={b.id}
                className="group p-4 rounded-2xl bg-white border border-[#EBE5D8] hover:border-orange-400 hover:shadow-lg transition-all flex flex-col justify-between space-y-3 relative"
              >
                <div 
                  onClick={() => onNavigate(b.url)}
                  className="flex items-start space-x-3 cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#F5F0E6] flex items-center justify-center shrink-0">
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(b.url)}&sz=32`}
                      alt=""
                      className="w-5 h-5 rounded-sm"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>
                  <div className="truncate flex-1">
                    <div className="text-xs font-bold text-zinc-800 truncate group-hover:text-orange-600 transition-colors">
                      {b.title}
                    </div>
                    <div className="text-[11px] text-zinc-400 truncate mt-0.5">{b.url}</div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                  <span className="text-[10px] text-zinc-400">Added recently</span>
                  <button
                    onClick={() => onDeleteBookmark(b.id)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                    title="Delete bookmark"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add Bookmark Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-zinc-800 font-serif">Add New Bookmark</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-zinc-600 mb-1 block">Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. GitHub"
                  className="w-full bg-[#F5F0E6] border border-[#E2DAD0] rounded-xl px-3 py-2 text-xs text-zinc-800 outline-none focus:border-orange-500"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-600 mb-1 block">URL</label>
                <input
                  type="text"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="e.g. https://github.com"
                  className="w-full bg-[#F5F0E6] border border-[#E2DAD0] rounded-xl px-3 py-2 text-xs text-zinc-800 outline-none focus:border-orange-500"
                  required
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold transition-colors cursor-pointer shadow-md shadow-orange-500/20"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
