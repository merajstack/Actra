import React, { useState } from 'react';
import { HistoryItem } from '../types';
import { Search, Trash2, Calendar, Globe, ArrowLeft, Clock } from 'lucide-react';

interface HistoryPageProps {
  history: HistoryItem[];
  onNavigate: (url: string) => void;
  onDeleteHistoryItem: (id: string) => void;
  onClearAllHistory: () => void;
  onBackToBrowser: () => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({
  history,
  onNavigate,
  onDeleteHistoryItem,
  onClearAllHistory,
  onBackToBrowser,
}) => {
  const [search, setSearch] = useState('');

  const filteredHistory = history.filter(
    h => h.title.toLowerCase().includes(search.toLowerCase()) || h.url.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 bg-[#FDFBF7] flex flex-col overflow-y-auto select-none">
      {/* Header */}
      <div className="bg-white border-b border-[#E8E2D5] px-8 py-6 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBackToBrowser}
            className="p-2 rounded-xl bg-[#F5F0E6] hover:bg-[#EAE4D6] text-zinc-700 transition-colors cursor-pointer"
            title="Back to Browser"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-zinc-800 font-serif">History</h1>
            <p className="text-xs text-zinc-500">Websites visited across your Actra browsing sessions</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search history..."
              className="w-full bg-[#F5F0E6] border border-[#E2DAD0] rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-800 outline-none focus:border-orange-500"
            />
          </div>
          <button
            onClick={onClearAllHistory}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 font-semibold text-xs transition-colors cursor-pointer border border-red-200"
          >
            <Trash2 className="w-4 h-4" />
            <span>Clear Browsing Data</span>
          </button>
        </div>
      </div>

      {/* History List */}
      <div className="max-w-4xl w-full mx-auto p-8 space-y-4">
        {filteredHistory.length === 0 ? (
          <div className="text-center py-20 text-zinc-400">
            <Clock className="w-12 h-12 mx-auto mb-3 opacity-40 text-orange-500" />
            <p className="text-sm font-medium">No browsing history found.</p>
          </div>
        ) : (
          filteredHistory.map((item) => {
            const dateStr = new Date(item.visitTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return (
              <div
                key={item.id}
                className="flex items-center justify-between p-4 rounded-2xl bg-white border border-[#EBE5D8] hover:border-orange-300 hover:shadow-md transition-all group"
              >
                <div 
                  onClick={() => onNavigate(item.url)}
                  className="flex items-center space-x-4 flex-1 cursor-pointer truncate mr-4"
                >
                  <div className="w-9 h-9 rounded-xl bg-[#F5F0E6] flex items-center justify-center shrink-0">
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(item.url)}&sz=32`}
                      alt=""
                      className="w-4 h-4 rounded-sm"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>
                  <div className="truncate">
                    <div className="text-xs font-semibold text-zinc-800 truncate group-hover:text-orange-600 transition-colors">
                      {item.title}
                    </div>
                    <div className="text-[11px] text-zinc-400 truncate">{item.url}</div>
                  </div>
                </div>

                <div className="flex items-center space-x-4 shrink-0">
                  <span className="text-[11px] font-medium text-zinc-400">{dateStr}</span>
                  <button
                    onClick={() => onDeleteHistoryItem(item.id)}
                    className="p-2 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                    title="Remove from history"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
