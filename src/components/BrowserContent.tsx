import React, { useState } from 'react';
import { Globe, Lock, Shield, Sparkles, FileText, Code, CheckCircle, RefreshCw, ExternalLink, Search, Image, Video, Newspaper } from 'lucide-react';


interface BrowserContentProps {
  url: string;
  zoomLevel: number;
  isIncognito: boolean;
  onNavigate?: (url: string) => void;
}

export const BrowserContent: React.FC<BrowserContentProps> = ({ url, zoomLevel, isIncognito, onNavigate }) => {
  const [viewMode, setViewMode] = useState<'normal' | 'reader' | 'source'>('normal');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTab, setSearchTab] = useState<'all' | 'images' | 'videos' | 'news'>('all');

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const lowerUrl = url.toLowerCase();
  const isSearchUrl = (url.includes('google.com/search') || url.includes('duckduckgo.com') || url.includes('search?q=') || !url.includes('.') || url.includes(' '));
  let searchQuery = '';
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    searchQuery = urlObj.searchParams.get('q') || urlObj.searchParams.get('query') || '';
  } catch (e) {
    searchQuery = url;
  }
  if (!searchQuery && isSearchUrl) {
    searchQuery = url.replace('https://www.google.com/search?q=', '').replace('https://html.duckduckgo.com/html/?q=', '');
  }

  const getMockSearchResults = (query: string) => {
    const q = (query || '').toLowerCase();
    if (q.includes('youtube')) {
      return [
        { title: 'YouTube', url: 'https://www.youtube.com', snippet: 'Enjoy the videos and music you love, upload original content, and share it all with friends, family, and the world on YouTube.', domain: 'youtube.com' },
        { title: 'Trending - YouTube', url: 'https://www.youtube.com/feed/trending', snippet: 'Discover what is trending on YouTube around the world.', domain: 'youtube.com' },
        { title: 'YouTube Music', url: 'https://music.youtube.com', snippet: 'A new music service with official albums, singles, videos, remixes, live performances and more.', domain: 'music.youtube.com' }
      ];
    }
    if (q.includes('github')) {
      return [
        { title: 'GitHub: Let’s build from here', url: 'https://github.com', snippet: 'GitHub is where over 100 million developers shape the future of software, together. Contribute to the open source community.', domain: 'github.com' },
        { title: 'Login · GitHub', url: 'https://github.com/login', snippet: 'Sign in to GitHub to continue to your repositories, pull requests, and issues.', domain: 'github.com' }
      ];
    }
    return [
      { title: `${query || url} - Official Webpage & Overview`, url: `https://www.google.com/search?q=${encodeURIComponent(query || url)}`, snippet: `Explore comprehensive information, latest updates, documentation, and resources regarding ${query || url}.`, domain: 'example.com' },
      { title: `Latest News and Community Discussions about ${query || url}`, url: `https://news.google.com/search?q=${encodeURIComponent(query || url)}`, snippet: `Read breaking news, expert analysis, and community discussions on ${query || url} from top global sources.`, domain: 'news.example.com' },
      { title: `Getting Started with ${query || url} - Beginner Guide`, url: `https://docs.example.com`, snippet: `Step-by-step tutorials, best practices, and frequently asked questions for ${query || url}.`, domain: 'docs.example.com' }
    ];
  };

  const searchResults = getMockSearchResults(searchQuery);

  return (
    <div 
      className={`flex-1 relative flex flex-col overflow-hidden ${isIncognito ? 'bg-zinc-950 text-zinc-100' : 'bg-[#FDFBF7] text-zinc-800'}`}
      style={{ zoom: `${zoomLevel}%` }}
    >

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto relative flex flex-col bg-white dark:bg-zinc-950">
        {viewMode === 'source' ? (
          <div className="p-6 bg-zinc-950 text-zinc-200 font-mono text-xs leading-relaxed overflow-x-auto">
            <div className="text-zinc-500 mb-2">// Actra Chromium V8 Engine Source View for: {url}</div>
            <div className="text-orange-400">&lt;!DOCTYPE html&gt;</div>
            <div className="text-cyan-400">&lt;html lang="en"&gt;</div>
            <div className="pl-4 text-zinc-300">&lt;head&gt;</div>
            <div className="pl-8 text-zinc-400">&lt;meta charset="UTF-8" /&gt;</div>
            <div className="pl-8 text-zinc-400">&lt;title&gt;Actra Secured Page - {url}&lt;/title&gt;</div>
            <div className="pl-4 text-zinc-300">&lt;/head&gt;</div>
            <div className="pl-4 text-zinc-300">&lt;body class="actra-chromium-container"&gt;</div>
            <div className="pl-8 text-emerald-400">&lt;main id="app-root"&gt;</div>
            <div className="pl-12 text-zinc-200">Successfully rendered inside Actra Browser native V8 sandbox.</div>
            <div className="pl-8 text-emerald-400">&lt;/main&gt;</div>
            <div className="pl-4 text-zinc-300">&lt;/body&gt;</div>
            <div className="text-cyan-400">&lt;/html&gt;</div>
          </div>
        ) : viewMode === 'reader' ? (
          <div className="max-w-2xl mx-auto p-12 space-y-6 font-serif bg-white dark:bg-zinc-900 shadow-sm my-8 rounded-2xl border border-[#EBE5D8]">
            <span className="text-xs font-sans uppercase tracking-widest text-orange-600 font-semibold bg-orange-100 px-2.5 py-1 rounded-md">
              Reader View Active
            </span>
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">Clean Article Presentation for {url}</h1>
          </div>
        ) : isSearchUrl ? (
          <div className="flex-1 bg-white dark:bg-zinc-950 min-h-full">
            {/* Search Header */}
            <div className="border-b border-zinc-200 dark:border-zinc-800 px-8 pt-4 pb-0 flex items-center justify-between sticky top-0 bg-white dark:bg-zinc-950 z-10 shadow-xs">
              <div className="flex items-center space-x-6">
                <div className="text-xl font-bold tracking-tight text-orange-600">
                  Actra<span className="text-zinc-800 dark:text-zinc-200 font-normal">Search</span>
                </div>
                <div className="text-sm bg-zinc-100 dark:bg-zinc-900 px-4 py-2 rounded-full border border-zinc-200 dark:border-zinc-800 font-medium text-zinc-800 dark:text-zinc-200 w-96 flex items-center justify-between">
                  <span className="truncate">{searchQuery}</span>
                  <Search className="w-4 h-4 text-orange-500 shrink-0 ml-2" />
                </div>
              </div>
              <div className="flex items-center space-x-4 text-xs text-zinc-500">
                <span>Secure V8 Engine</span>
              </div>
            </div>

            {/* Search Tabs */}
            <div className="border-b border-zinc-200 dark:border-zinc-800 px-8 flex space-x-6 text-xs font-medium text-zinc-600 dark:text-zinc-400">
              <button onClick={() => setSearchTab('all')} className={`py-3 border-b-2 flex items-center space-x-1.5 cursor-pointer ${searchTab === 'all' ? 'border-orange-600 text-orange-600 font-semibold' : 'border-transparent hover:text-zinc-800'}`}>
                <Search className="w-3.5 h-3.5" />
                <span>All</span>
              </button>
              <button onClick={() => setSearchTab('images')} className={`py-3 border-b-2 flex items-center space-x-1.5 cursor-pointer ${searchTab === 'images' ? 'border-orange-600 text-orange-600 font-semibold' : 'border-transparent hover:text-zinc-800'}`}>
                <Image className="w-3.5 h-3.5" />
                <span>Images</span>
              </button>
              <button onClick={() => setSearchTab('videos')} className={`py-3 border-b-2 flex items-center space-x-1.5 cursor-pointer ${searchTab === 'videos' ? 'border-orange-600 text-orange-600 font-semibold' : 'border-transparent hover:text-zinc-800'}`}>
                <Video className="w-3.5 h-3.5" />
                <span>Videos</span>
              </button>
              <button onClick={() => setSearchTab('news')} className={`py-3 border-b-2 flex items-center space-x-1.5 cursor-pointer ${searchTab === 'news' ? 'border-orange-600 text-orange-600 font-semibold' : 'border-transparent hover:text-zinc-800'}`}>
                <Newspaper className="w-3.5 h-3.5" />
                <span>News</span>
              </button>
            </div>

            {/* Search Results Body */}
            <div className="max-w-3xl px-8 py-6 space-y-6">
              <div className="text-xs text-zinc-400">About search results for "{searchQuery}"</div>

              {searchTab === 'images' ? (
                <div className="grid grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="bg-zinc-100 dark:bg-zinc-900 h-40 rounded-xl flex flex-col items-center justify-center border border-zinc-200 dark:border-zinc-800 text-zinc-400 text-xs p-4 text-center">
                      <Image className="w-8 h-8 mb-2 text-orange-500 opacity-80" />
                      <span>{searchQuery} preview {i}</span>
                    </div>
                  ))}
                </div>
              ) : searchTab === 'videos' ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex space-x-4 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                      <div className="w-32 h-20 bg-zinc-200 dark:bg-zinc-800 rounded-lg flex items-center justify-center shrink-0">
                        <Video className="w-6 h-6 text-orange-500" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-semibold text-sm text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">Official {searchQuery} Video Tutorial & Walkthrough {i}</h4>
                        <p className="text-xs text-zinc-500">YouTube • 12K views • 2 days ago</p>
                        <p className="text-xs text-zinc-600 dark:text-zinc-300">Detailed video breakdown and highlights for {searchQuery}...</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-6">
                  {searchResults.map((res, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="text-xs text-zinc-500 font-mono flex items-center space-x-1.5">
                        <span className="w-4 h-4 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-orange-600">{res.domain[0].toUpperCase()}</span>
                        <span className="truncate">{res.domain}</span>
                      </div>
                      <h3 
                        onClick={() => onNavigate && onNavigate(res.url)}
                        className="text-base font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        {res.title}
                      </h3>
                      <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                        {res.snippet}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <iframe
            src={url}
            className="flex-1 w-full h-full border-none bg-white block"
            title={url}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        )}
      </div>
    </div>
  );
};



