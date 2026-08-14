import React, { useState } from 'react';
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react';

interface FindInPageBarProps {
  onClose: () => void;
}

export const FindInPageBar: React.FC<FindInPageBarProps> = ({ onClose }) => {
  const [query, setQuery] = useState('');
  const [matchCount, setMatchCount] = useState(0);

  const handleSearch = (val: string) => {
    setQuery(val);
    if (!val.trim()) {
      setMatchCount(0);
      return;
    }
    // Simulate finding matches on page
    setMatchCount(val.length > 1 ? 3 : 0);
  };

  return (
    <div className="absolute top-2 right-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl p-2 flex items-center space-x-2 z-50 text-xs">
      <div className="flex items-center space-x-1.5 px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
        <Search className="w-3.5 h-3.5 text-zinc-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Find in page..."
          className="bg-transparent outline-none text-zinc-800 dark:text-zinc-200 text-xs w-40"
          autoFocus
        />
      </div>
      <span className="text-[11px] text-zinc-400 font-medium px-1">
        {query ? `${matchCount > 0 ? '1 of ' + matchCount : 'No'} matches` : ''}
      </span>
      <div className="flex items-center space-x-1">
        <button className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300">
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300">
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-700"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
