import React, { useState } from 'react';
import { Search, Play, ThumbsUp, MessageSquare, Share2, Sparkles, Compass, Flame, Clock, Bookmark, User, LogOut, LogIn, Bell } from 'lucide-react';

export const YouTubeEngine: React.FC = () => {
  const [currentVideo, setCurrentVideo] = useState<number | null>(null);
  const [likes, setLikes] = useState(1420);
  const [liked, setLiked] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(true);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [emailInput, setEmailInput] = useState('');

  const [comments, setComments] = useState([
    { author: 'DevMaster99', text: 'This rendering engine is blazing fast! Actra is amazing.', time: '2 hours ago' },
    { author: 'ChromiumFan', text: 'Love the warm beige and orange macOS aesthetic.', time: '5 hours ago' }
  ]);

  const videos = [
    { id: 1, title: 'Building a Lightning-Fast Chromium Browser in Electron', channel: 'Actra Tech', views: '48K views', time: '3 days ago', duration: '14:22', category: 'Technology', videoId: 'dQw4w9WgXcQ' },
    { id: 2, title: 'Designing macOS Native UI with Tailwind CSS & React', channel: 'Design Systems', views: '120K views', time: '1 week ago', duration: '22:15', category: 'Design', videoId: 'jfKfPfyJRdk' },
    { id: 3, title: 'V8 JavaScript Engine Deep Dive & Garbage Collection', channel: 'Code Academy', views: '89K views', time: '2 weeks ago', duration: '45:10', category: 'Programming', videoId: '5qap5aO4i9A' },
    { id: 4, title: 'Lo-Fi Beats to Code / Browse the Web To ☕', channel: 'Chillhop Music', views: '3.4M views', time: 'Streaming Live', duration: 'LIVE', category: 'Music', videoId: 'jfKfPfyJRdk' }
  ];

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setComments([{ author: isLoggedIn ? 'You (Google Account)' : 'Guest User', text: commentText, time: 'Just now' }, ...comments]);
    setCommentText('');
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) return;
    setIsLoggedIn(true);
    setShowLoginModal(false);
    setShowAccountMenu(false);
  };

  return (
    <div className="flex-1 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col overflow-y-auto select-none relative">
      {/* YouTube Top Bar */}
      <div className="h-14 px-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between sticky top-0 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md z-30 shadow-xs">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1.5 cursor-pointer" onClick={() => setCurrentVideo(null)}>
            <div className="w-8 h-8 rounded-xl bg-red-600 flex items-center justify-center text-white font-bold shadow-md shadow-red-600/30">
              <Play className="w-4 h-4 fill-white" />
            </div>
            <span className="font-bold tracking-tight text-lg font-serif">YouTube</span>
          </div>
        </div>
        <div className="flex items-center space-x-3 w-full max-w-xl mx-8">
          <div className="flex items-center flex-1 bg-zinc-100 dark:bg-zinc-900 rounded-full px-4 py-2 border border-zinc-200 dark:border-zinc-800">
            <input type="text" placeholder="Search YouTube..." className="w-full bg-transparent text-xs outline-none" />
            <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          </div>
        </div>
        <div className="flex items-center space-x-3 relative">
          {isLoggedIn ? (
            <div className="relative">
              <button
                onClick={() => setShowAccountMenu(!showAccountMenu)}
                className="w-9 h-9 rounded-full bg-gradient-to-tr from-red-600 to-orange-500 text-white font-bold text-xs flex items-center justify-center shadow-md cursor-pointer hover:opacity-90 transition-opacity"
              >
                M
              </button>

              {/* Account Dropdown Menu */}
              {showAccountMenu && (
                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl py-3 z-50 text-xs">
                  <div className="px-4 pb-3 border-b border-zinc-100 dark:border-zinc-800 space-y-0.5">
                    <p className="font-bold text-zinc-800 dark:text-zinc-100">Google Account</p>
                    <p className="text-[11px] text-zinc-500 font-mono truncate">{emailInput || 'meraj.md5862@gmail.com'}</p>
                  </div>
                  <div className="py-2 space-y-1">
                    <div className="px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer flex items-center space-x-2 text-zinc-700 dark:text-zinc-300">
                      <User className="w-4 h-4 text-red-600" />
                      <span>Your Channel</span>
                    </div>
                    <div className="px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer flex items-center space-x-2 text-zinc-700 dark:text-zinc-300">
                      <Bell className="w-4 h-4 text-red-600" />
                      <span>Subscriptions</span>
                    </div>
                  </div>
                  <div className="border-t border-zinc-100 dark:border-zinc-800 pt-2">
                    <button
                      onClick={() => { setIsLoggedIn(false); setShowAccountMenu(false); }}
                      className="w-full px-4 py-2.5 text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center space-x-2 font-semibold cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign out of YouTube</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setShowLoginModal(true)}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-full bg-red-600 hover:bg-red-700 text-white font-semibold text-xs shadow-md shadow-red-600/20 transition-colors cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign in</span>
            </button>
          )}
        </div>
      </div>

      {/* Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl p-8 shadow-2xl border border-zinc-200 dark:border-zinc-800 space-y-6">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-red-600/30">
                <Play className="w-6 h-6 fill-white" />
              </div>
              <h2 className="text-xl font-bold font-serif">Sign in to YouTube</h2>
              <p className="text-xs text-zinc-500">Access your saved videos, subscriptions, and comments inside Actra.</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Google Account Email</label>
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="yourname@gmail.com"
                  className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-xs outline-none focus:border-red-500"
                />
              </div>
              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLoginModal(false)}
                  className="flex-1 py-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-xs font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-semibold text-white shadow-md shadow-red-600/20 cursor-pointer"
                >
                  Next / Sign In
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {currentVideo !== null ? (
        // Watch View with Embedded Real YouTube iframe player
        <div className="max-w-6xl mx-auto p-8 w-full grid grid-cols-3 gap-8">
          <div className="col-span-2 space-y-4">
            <div className="aspect-video bg-black rounded-2xl overflow-hidden relative shadow-2xl">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${videos[currentVideo].videoId}?autoplay=1&rel=0`}
                title={videos[currentVideo].title}
                className="w-full h-full border-none"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <h1 className="text-xl font-bold font-serif">{videos[currentVideo].title}</h1>
            <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-orange-500 to-red-600 text-white font-bold flex items-center justify-center">
                  A
                </div>
                <div>
                  <div className="font-bold text-xs">{videos[currentVideo].channel}</div>
                  <div className="text-[11px] text-zinc-500">1.2M subscribers</div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => { setLiked(!liked); setLikes(liked ? likes - 1 : likes + 1); }}
                  className={`flex items-center space-x-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                    liked ? 'bg-red-600 text-white' : 'bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  <ThumbsUp className="w-4 h-4" />
                  <span>{likes}</span>
                </button>
              </div>
            </div>

            {/* Comments Section */}
            <div className="space-y-4 pt-4">
              <h3 className="font-bold text-sm flex items-center space-x-2">
                <MessageSquare className="w-4 h-4 text-red-600" />
                <span>{comments.length} Comments</span>
              </h3>
              <form onSubmit={handleAddComment} className="flex space-x-3">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder={isLoggedIn ? "Add a public comment..." : "Sign in to add a comment..."}
                  className="flex-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-xs outline-none focus:border-red-500"
                />
                <button type="submit" className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer">
                  Comment
                </button>
              </form>
              <div className="space-y-3 pt-2">
                {comments.map((c, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-zinc-500">
                      <span className="font-bold text-zinc-800 dark:text-zinc-200">{c.author}</span>
                      <span>{c.time}</span>
                    </div>
                    <p className="text-xs text-zinc-700 dark:text-zinc-300">{c.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar Recommendations */}
          <div className="space-y-4">
            <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-400">Up Next</h3>
            {videos.map((v, idx) => (
              <div key={v.id} onClick={() => setCurrentVideo(idx)} className="flex space-x-3 cursor-pointer group">
                <div className="w-36 h-20 rounded-xl bg-zinc-200 dark:bg-zinc-800 shrink-0 flex items-center justify-center font-bold text-zinc-400 group-hover:scale-105 transition-transform">
                  <Play className="w-5 h-5 text-red-600" />
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-xs group-hover:text-red-600 transition-colors line-clamp-2">{v.title}</div>
                  <div className="text-[11px] text-zinc-500">{v.channel}</div>
                  <div className="text-[10px] text-zinc-400">{v.views} • {v.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        // YouTube Home Feed
        <div className="p-8 space-y-6 max-w-7xl mx-auto w-full">
          {!isLoggedIn && (
            <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-2xl p-6 flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="font-bold text-sm text-red-900 dark:text-red-200">Sign in to enjoy YouTube</h3>
                <p className="text-xs text-red-700 dark:text-red-300">Don't miss out on new videos. Sign in to save videos, like, and subscribe.</p>
              </div>
              <button
                onClick={() => setShowLoginModal(true)}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-md shadow-red-600/20 cursor-pointer"
              >
                Sign in
              </button>
            </div>
          )}

          <div className="grid grid-cols-4 gap-6">
            {videos.map((v, idx) => (
              <div
                key={v.id}
                onClick={() => setCurrentVideo(idx)}
                className="group flex flex-col space-y-3 cursor-pointer"
              >
                <div className="aspect-video bg-zinc-200 dark:bg-zinc-900 rounded-2xl overflow-hidden relative flex items-center justify-center group-hover:shadow-xl transition-all border border-zinc-200 dark:border-zinc-800">
                  <div className="absolute inset-0 bg-gradient-to-tr from-red-600/20 to-orange-500/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="w-12 h-12 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <Play className="w-5 h-5 fill-white ml-0.5" />
                  </div>
                  <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] font-mono px-2 py-0.5 rounded font-semibold">
                    {v.duration}
                  </span>
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-xs group-hover:text-red-600 transition-colors line-clamp-2">{v.title}</h3>
                  <p className="text-[11px] text-zinc-500">{v.channel}</p>
                  <p className="text-[10px] text-zinc-400">{v.views} • {v.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
