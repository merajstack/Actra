import React, { useEffect, useState } from 'react';
import { ArrowLeft, Settings, Search, Lock, Shield, Monitor, Globe, HardDrive, KeyRound, Save } from 'lucide-react';
import { AIProviderSettings } from '../types';

interface SettingsPageProps {
  onBackToBrowser: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onBackToBrowser }) => {
  const [providerSettings, setProviderSettings] = useState<AIProviderSettings>({ cloudflareAccountId: '', cloudflareApiKey: '', groqKey: '' });
  const [saveState, setSaveState] = useState('');

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.getKeys) {
      api.getKeys().then((keys: AIProviderSettings) => setProviderSettings({ ...providerSettings, ...keys }));
    } else {
      const saved = localStorage.getItem('actra-provider-settings');
      if (saved) setProviderSettings(JSON.parse(saved));
    }
  }, []);

  const saveProviderSettings = async () => {
    const api = (window as any).electronAPI;
    if (api?.saveKeys) {
      await api.saveKeys(providerSettings);
    } else {
      localStorage.setItem('actra-provider-settings', JSON.stringify(providerSettings));
    }
    setSaveState('Saved locally');
    setTimeout(() => setSaveState(''), 2500);
  };

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
            <h1 className="text-2xl font-bold text-zinc-800 font-serif">Settings</h1>
            <p className="text-xs text-zinc-500">Manage your Actra browser preferences, privacy, and defaults</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl w-full mx-auto p-8 space-y-6">
        {/* AI provider credentials */}
        <div className="bg-white p-6 rounded-2xl border border-[#EBE5D8] shadow-sm space-y-4">
          <div className="flex items-center space-x-3 border-b border-zinc-100 pb-3">
            <KeyRound className="w-5 h-5 text-orange-500" />
            <div>
              <h3 className="text-sm font-bold text-zinc-800 font-serif">AI Provider Credentials</h3>
              <p className="text-[11px] text-zinc-400">Stored on this device and used by Actra AI.</p>
            </div>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-zinc-800">Cloudflare Account ID</span>
            <input value={providerSettings.cloudflareAccountId} onChange={e => setProviderSettings(prev => ({ ...prev, cloudflareAccountId: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-[#E2DAD0] bg-[#FDFBF7] text-xs font-mono outline-none focus:border-orange-400" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-zinc-800">Cloudflare API Token</span>
            <input type="password" value={providerSettings.cloudflareApiKey} onChange={e => setProviderSettings(prev => ({ ...prev, cloudflareApiKey: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-[#E2DAD0] bg-[#FDFBF7] text-xs font-mono outline-none focus:border-orange-400" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-zinc-800">Groq API Key (fallback)</span>
            <input type="password" value={providerSettings.groqKey} onChange={e => setProviderSettings(prev => ({ ...prev, groqKey: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-[#E2DAD0] bg-[#FDFBF7] text-xs font-mono outline-none focus:border-orange-400" />
          </label>
          <div className="flex items-center justify-end gap-3">
            {saveState && <span className="text-xs text-emerald-600">{saveState}</span>}
            <button onClick={saveProviderSettings} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold transition-colors">
              <Save className="w-3.5 h-3.5" /> Save credentials
            </button>
          </div>
        </div>

        {/* Search Engine */}
        <div className="bg-white p-6 rounded-2xl border border-[#EBE5D8] shadow-sm space-y-4">
          <div className="flex items-center space-x-3 border-b border-zinc-100 pb-3">
            <Search className="w-5 h-5 text-orange-500" />
            <h3 className="text-sm font-bold text-zinc-800 font-serif">Search Engine</h3>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-zinc-800">Default search engine used in the address bar</div>
              <div className="text-[11px] text-zinc-400">Google search with encrypted HTTPS grounding</div>
            </div>
            <select className="bg-[#F5F0E6] border border-[#E2DAD0] rounded-xl px-3 py-2 text-xs font-medium text-zinc-800 outline-none cursor-pointer">
              <option>Google (Default)</option>
              <option>DuckDuckGo (Private)</option>
              <option>Brave Search</option>
              <option>Ecosia</option>
            </select>
          </div>
        </div>

        {/* Appearance */}
        <div className="bg-white p-6 rounded-2xl border border-[#EBE5D8] shadow-sm space-y-4">
          <div className="flex items-center space-x-3 border-b border-zinc-100 pb-3">
            <Monitor className="w-5 h-5 text-orange-500" />
            <h3 className="text-sm font-bold text-zinc-800 font-serif">Appearance & Theme</h3>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-zinc-800">Browser Theme Mode</div>
              <div className="text-[11px] text-zinc-400">Match macOS system appearance or set beige & orange</div>
            </div>
            <select className="bg-[#F5F0E6] border border-[#E2DAD0] rounded-xl px-3 py-2 text-xs font-medium text-zinc-800 outline-none cursor-pointer">
              <option>Warm Beige & Orange (Actra Classic)</option>
              <option>macOS System Dark</option>
              <option>Minimalist Light</option>
            </select>
          </div>
        </div>

        {/* Privacy & Security */}
        <div className="bg-white p-6 rounded-2xl border border-[#EBE5D8] shadow-sm space-y-4">
          <div className="flex items-center space-x-3 border-b border-zinc-100 pb-3">
            <Shield className="w-5 h-5 text-orange-500" />
            <h3 className="text-sm font-bold text-zinc-800 font-serif">Privacy & Security</h3>
          </div>
          <div className="space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <div className="text-xs font-semibold text-zinc-800">Block third-party cookies</div>
                <div className="text-[11px] text-zinc-400">Prevent tracking across websites</div>
              </div>
              <input type="checkbox" defaultChecked className="w-4 h-4 accent-orange-600 rounded cursor-pointer" />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <div className="text-xs font-semibold text-zinc-800">HTTPS-Only Mode</div>
                <div className="text-[11px] text-zinc-400">Upgrade all navigation to secure connections</div>
              </div>
              <input type="checkbox" defaultChecked className="w-4 h-4 accent-orange-600 rounded cursor-pointer" />
            </label>
          </div>
        </div>

        {/* Downloads Location */}
        <div className="bg-white p-6 rounded-2xl border border-[#EBE5D8] shadow-sm space-y-4">
          <div className="flex items-center space-x-3 border-b border-zinc-100 pb-3">
            <HardDrive className="w-5 h-5 text-orange-500" />
            <h3 className="text-sm font-bold text-zinc-800 font-serif">Downloads Location</h3>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-xs font-mono bg-[#F5F0E6] px-3 py-2 rounded-xl text-zinc-700 border border-[#E2DAD0]">
              /Users/username/Downloads/ActraDownloads
            </div>
            <button className="px-4 py-2 rounded-xl bg-[#F5F0E6] hover:bg-[#EAE4D6] text-zinc-700 text-xs font-semibold transition-colors cursor-pointer border border-[#E2DAD0]">
              Change...
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
