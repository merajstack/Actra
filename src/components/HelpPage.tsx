import React from 'react';
import { ArrowLeft, Sparkles, Cpu, Shield, Globe, Terminal } from 'lucide-react';

interface HelpPageProps {
  onBackToBrowser: () => void;
}

export const HelpPage: React.FC<HelpPageProps> = ({ onBackToBrowser }) => {
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
            <h1 className="text-2xl font-bold text-zinc-800 font-serif">About Actra Browser</h1>
            <p className="text-xs text-zinc-500">Architecture, Electron Chromium runtime, and open source credits</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl w-full mx-auto p-8 space-y-6">
        <div className="bg-white p-8 rounded-2xl border border-[#EBE5D8] shadow-sm space-y-6">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-black text-2xl shadow-xl shadow-orange-500/20">
              A
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-800 font-serif">Actra v1.4.2 (Chromium 124.0)</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Built with Electron, Node.js, and V8 JavaScript engine for macOS.</p>
            </div>
          </div>

          <div className="border-t border-zinc-100 pt-6 space-y-4">
            <h3 className="text-sm font-bold text-zinc-800">Architecture & BrowserViews</h3>
            <p className="text-xs text-zinc-600 leading-relaxed">
              Unlike web-based iframe wrappers, Actra runs on <strong>Electron</strong>. Each tab is powered by an isolated native <code>BrowserView</code> (or <code>WebContentsView</code>), providing a fully standards-compliant Chromium rendering engine, V8 JS runtime, and secure network stack.
            </p>
          </div>

          <div className="border-t border-zinc-100 pt-6 space-y-4">
            <h3 className="text-sm font-bold text-zinc-800">Quick Start & Packaging Instructions</h3>
            <div className="bg-[#F5F0E6] p-4 rounded-xl font-mono text-[11px] text-zinc-700 space-y-1 border border-[#E2DAD0]">
              <div># Install dependencies</div>
              <div>npm install</div>
              <div className="pt-2"># Run Electron application in development</div>
              <div>npm start</div>
              <div className="pt-2"># Build macOS installer (.dmg)</div>
              <div>npm run build-mac</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
