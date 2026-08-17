import React from 'react';
import { Bookmark } from '../types';

interface BookmarksBarProps {
  bookmarks: Bookmark[];
  onNavigate: (url: string) => void;
  onOpenManager: () => void;
}

export const BookmarksBar: React.FC<BookmarksBarProps> = ({ bookmarks, onNavigate, onOpenManager }) => {
  return (
    <div className="h-7 bg-[#F7F3EB] border-b border-[#E8E2D5] px-3 flex items-center space-x-2 text-xs overflow-x-auto select-none scrollbar-none">
      <div className="flex items-center space-x-1 flex-1 overflow-x-auto scrollbar-none">
        {bookmarks.slice(0, 8).map((bookmark) => (
          <button
            key={bookmark.id}
            onClick={() => onNavigate(bookmark.url)}
            className="flex items-center space-x-1.5 px-2 py-0.5 rounded hover:bg-[#EAE4D6] text-zinc-700 hover:text-zinc-900 transition-colors shrink-0 cursor-pointer"
            title={bookmark.url}
          >
            <img
              src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(bookmark.url)}&sz=32`}
              alt=""
              className="w-3.5 h-3.5 rounded-xs"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <span className="truncate max-w-[120px] text-[11px] font-medium">{bookmark.title}</span>
          </button>
        ))}
      </div>
      <button
        onClick={onOpenManager}
        className="text-[11px] text-orange-600 hover:text-orange-700 px-1.5 py-0.5 rounded hover:bg-[#EAE4D6] font-medium shrink-0 cursor-pointer"
      >
        All bookmarks
      </button>
    </div>
  );
};
