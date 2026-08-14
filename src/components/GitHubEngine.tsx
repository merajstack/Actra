import React, { useState } from 'react';
import { GitBranch, Star, GitPullRequest, Shield, Code, FileText, Folder, Terminal, Sparkles, Check } from 'lucide-react';

export const GitHubEngine: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'code' | 'issues' | 'pulls'>('code');
  const [starred, setStarred] = useState(false);

  const files = [
    { name: 'electron', type: 'folder', commit: 'Bump Electron to v30.0.2', time: '3 hours ago' },
    { name: 'src', type: 'folder', commit: 'Refactor browserView tab lifecycle', time: 'yesterday' },
    { name: 'package.json', type: 'file', commit: 'Add electron-store and dependencies', time: '2 days ago' },
    { name: 'README.md', type: 'file', commit: 'Update macOS architecture documentation', time: '3 days ago' },
  ];

  return (
    <div className="flex-1 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col overflow-y-auto select-none">
      {/* GitHub Header */}
      <div className="bg-zinc-900 text-white px-8 py-4 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <svg className="w-7 h-7 fill-white" viewBox="0 0 16 16"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>
          <div className="flex items-center space-x-2 text-sm font-medium">
            <span className="text-zinc-400">actra-browser /</span>
            <span className="font-bold text-white">desktop-browser</span>
            <span className="text-[10px] bg-zinc-800 text-amber-400 px-2 py-0.5 rounded-full border border-zinc-700">Public</span>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setStarred(!starred)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer border ${
              starred ? 'bg-amber-500/20 border-amber-500 text-amber-300' : 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-zinc-200'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${starred ? 'fill-amber-400 text-amber-400' : ''}`} />
            <span>{starred ? 'Starred' : 'Star'}</span>
            <span className="ml-1 bg-zinc-900 px-1.5 py-0.5 rounded text-[10px]">1.4k</span>
          </button>
        </div>
      </div>

      {/* Nav Tabs */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 px-8 flex space-x-6 text-xs font-medium">
        <button onClick={() => setActiveTab('code')} className={`py-3 border-b-2 flex items-center space-x-1.5 cursor-pointer ${activeTab === 'code' ? 'border-orange-600 font-bold text-zinc-900 dark:text-zinc-100' : 'border-transparent text-zinc-500'}`}>
          <Code className="w-3.5 h-3.5" />
          <span>Code</span>
        </button>
        <button onClick={() => setActiveTab('issues')} className={`py-3 border-b-2 flex items-center space-x-1.5 cursor-pointer ${activeTab === 'issues' ? 'border-orange-600 font-bold text-zinc-900 dark:text-zinc-100' : 'border-transparent text-zinc-500'}`}>
          <Shield className="w-3.5 h-3.5" />
          <span>Issues</span>
          <span className="bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full text-[10px]">3</span>
        </button>
        <button onClick={() => setActiveTab('pulls')} className={`py-3 border-b-2 flex items-center space-x-1.5 cursor-pointer ${activeTab === 'pulls' ? 'border-orange-600 font-bold text-zinc-900 dark:text-zinc-100' : 'border-transparent text-zinc-500'}`}>
          <GitPullRequest className="w-3.5 h-3.5" />
          <span>Pull requests</span>
          <span className="bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full text-[10px]">12</span>
        </button>
      </div>

      <div className="max-w-6xl w-full mx-auto p-8 space-y-6">
        {activeTab === 'code' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-semibold bg-zinc-100 dark:bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <GitBranch className="w-3.5 h-3.5 text-orange-500" />
                <span>main</span>
              </div>
              <div className="text-xs text-zinc-500 font-mono">Latest commit: 4 hours ago</div>
            </div>

            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
              <div className="bg-zinc-50 dark:bg-zinc-900 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Actra core repository file tree
              </div>
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {files.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 text-xs">
                    <div className="flex items-center space-x-3 font-medium text-zinc-800 dark:text-zinc-200">
                      {file.type === 'folder' ? <Folder className="w-4 h-4 text-orange-500 fill-orange-500/20" /> : <FileText className="w-4 h-4 text-zinc-400" />}
                      <span>{file.name}</span>
                    </div>
                    <div className="text-zinc-500 font-mono">{file.commit}</div>
                    <div className="text-zinc-400">{file.time}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-12 text-center text-zinc-400">
            <Shield className="w-12 h-12 mx-auto mb-3 text-orange-500 opacity-60" />
            <p className="text-sm font-semibold">Active GitHub Issues & Pull Requests loaded via Actra V8 integration.</p>
          </div>
        )}
      </div>
    </div>
  );
};
