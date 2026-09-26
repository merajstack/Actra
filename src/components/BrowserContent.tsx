/**
 * BrowserContent — Web (non-Electron) fallback only.
 *
 * In Electron mode, App.tsx renders `<div className="flex-1" />` here instead,
 * and the native BrowserView handles all real web content. This component is
 * only reached when running in a plain browser (dev/demo mode).
 *
 * Rule: No fake mock search results. No simulated HTML. Just a real iframe
 * or a clean "open in browser" prompt.
 */
import React from 'react';
import { ExternalLink, Globe } from 'lucide-react';

interface BrowserContentProps {
  url: string;
  zoomLevel: number;
  isIncognito: boolean;
  onNavigate?: (url: string) => void;
}

export const BrowserContent: React.FC<BrowserContentProps> = ({ url, zoomLevel, isIncognito }) => {
  const isInternalPage = url.startsWith('chrome://');

  if (isInternalPage) {
    // Internal pages are handled by App.tsx routing — should never reach here
    return <div className="flex-1" />;
  }

  const isValidUrl = url.startsWith('http://') || url.startsWith('https://');

  if (!isValidUrl) {
    return (
      <div className={`flex-1 flex flex-col items-center justify-center gap-4 ${isIncognito ? 'bg-zinc-950 text-zinc-300' : 'bg-[#FDFBF7] text-zinc-600'}`}>
        <Globe className="w-12 h-12 opacity-30" />
        <p className="text-sm font-medium opacity-60">Enter a URL to browse</p>
      </div>
    );
  }

  return (
    <div
      className={`flex-1 relative flex flex-col overflow-hidden ${isIncognito ? 'bg-zinc-950' : 'bg-white'}`}
      style={{ zoom: `${zoomLevel}%` }}
    >
      {/* Web-mode notice — only shown outside Electron */}
      <div className="flex items-center gap-2 px-4 py-1.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-700 shrink-0">
        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
        <span>
          Running in web mode — native BrowserView unavailable. Some sites may block iframe embedding.
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto font-semibold underline underline-offset-2 whitespace-nowrap"
        >
          Open in new tab ↗
        </a>
      </div>

      {/* Real iframe — no mocked content */}
      <iframe
        src={url}
        className="flex-1 w-full h-full border-none block bg-white"
        title={url}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
      />
    </div>
  );
};
