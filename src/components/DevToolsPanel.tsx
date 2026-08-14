import React, { useState } from 'react';
import { Terminal, Code, Network, Database, X, Sparkles } from 'lucide-react';

interface DevToolsPanelProps {
  currentUrl: string;
  onClose: () => void;
}

export const DevToolsPanel: React.FC<DevToolsPanelProps> = ({ currentUrl, onClose }) => {
  const [activeTab, setActiveTab] = useState<'elements' | 'console' | 'network' | 'storage'>('console');
  const [logs, setLogs] = useState([
    { type: 'info', text: `Actra Browser DevTools connected to ${currentUrl}` },
    { type: 'log', text: 'DOM content loaded in 84ms' },
    { type: 'warn', text: 'Deprecation: Secure cookie missing SameSite attribute' },
  ]);
  const [inputVal, setInputVal] = useState('');

  const handleRunCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;
    setLogs(prev => [...prev, { type: 'log', text: `> ${inputVal}` }, { type: 'info', text: String(evalSafe(inputVal)) }]);
    setInputVal('');
  };

  const evalSafe = (code: string) => {
    try {
      if (code === 'document.location.href') return currentUrl;
      if (code === 'navigator.userAgent') return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Actra/1.4.2 Chromium/124.0';
      return eval(code);
    } catch (err: any) {
      return `VM Error: ${err.message}`;
    }
  };

  return (
    <div className="h-64 bg-zinc-900 border-t border-zinc-800 text-zinc-200 flex flex-col select-none z-40">
      {/* DevTools Toolbar */}
      <div className="h-9 px-4 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {(['elements', 'console', 'network', 'storage'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 rounded-md text-xs font-medium uppercase tracking-wider transition-colors cursor-pointer ${
                activeTab === tab ? 'bg-orange-600 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          title="Close DevTools (Cmd+Shift+I)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* DevTools Content */}
      <div className="flex-1 p-3 font-mono text-xs overflow-y-auto space-y-1.5">
        {activeTab === 'console' && (
          <div className="space-y-1">
            {logs.map((l, idx) => (
              <div key={idx} className={`flex items-start space-x-2 ${l.type === 'warn' ? 'text-amber-400' : l.type === 'info' ? 'text-cyan-400' : 'text-zinc-300'}`}>
                <span className="text-zinc-600">[{idx + 1}]</span>
                <span>{l.text}</span>
              </div>
            ))}
            <form onSubmit={handleRunCommand} className="flex items-center space-x-2 pt-2 border-t border-zinc-800 mt-2">
              <span className="text-orange-500">&gt;</span>
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="Enter JavaScript expression (e.g. navigator.userAgent)..."
                className="w-full bg-transparent text-zinc-200 outline-none font-mono text-xs"
              />
            </form>
          </div>
        )}

        {activeTab === 'elements' && (
          <div className="text-zinc-400 space-y-1 font-mono text-[11px]">
            <div className="text-orange-400">&lt;html lang="en"&gt;</div>
            <div className="pl-4 text-cyan-400">&lt;head&gt;...&lt;/head&gt;</div>
            <div className="pl-4 text-emerald-400">&lt;body class="actra-browser-viewport"&gt;</div>
            <div className="pl-8 text-zinc-300">&lt;div id="root" data-active-url="{currentUrl}"&gt;...&lt;/div&gt;</div>
            <div className="pl-4 text-emerald-400">&lt;/body&gt;</div>
            <div className="text-orange-400">&lt;/html&gt;</div>
          </div>
        )}

        {activeTab === 'network' && (
          <div className="space-y-1 text-[11px]">
            <div className="grid grid-cols-6 font-semibold text-zinc-500 border-b border-zinc-800 pb-1 mb-1">
              <span className="col-span-3">Name</span>
              <span>Status</span>
              <span>Type</span>
              <span>Time</span>
            </div>
            <div className="grid grid-cols-6 text-zinc-300 py-1 border-b border-zinc-800/50">
              <span className="col-span-3 truncate text-orange-400">{currentUrl}</span>
              <span className="text-emerald-500">200 OK</span>
              <span>document</span>
              <span>42ms</span>
            </div>
          </div>
        )}

        {activeTab === 'storage' && (
          <div className="space-y-3 text-[11px]">
            <div className="font-semibold text-zinc-400">Local Storage / IndexedDB for {currentUrl}</div>
            <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 text-zinc-400">
              No local storage items found for this origin.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
