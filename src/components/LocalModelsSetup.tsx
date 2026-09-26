import React from 'react';
import { AlertTriangle, Download, ShieldCheck } from 'lucide-react';
import { ActraLoader } from './ActraLoader';

interface LocalModelFile {
  id: string;
  name: string;
  downloadedBytes: number;
  installed: boolean;
}

interface LocalModelStatus {
  ready: boolean;
  downloading: boolean;
  phase?: string;
  percent?: number;
  error?: string | null;
  files: LocalModelFile[];
}

interface Props {
  status: LocalModelStatus;
  onDownload: () => void;
  onSkip: () => void;
}

const formatBytes = (bytes: number) => {
  if (!bytes) return 'Not downloaded';
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB downloaded`;
};

export const LocalModelsSetup: React.FC<Props> = ({ status, onDownload, onSkip }) => {
  const percent = Math.max(0, Math.min(100, status.percent || 0));

  return (
    <div className="absolute inset-0 z-[200000] flex items-center justify-center bg-[#FDFBF7] p-6 text-zinc-800">
      <div className="w-full max-w-xl rounded-2xl border border-[#E8E2D5] bg-white p-8 shadow-xl">
        <div className="mb-6 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-900">Download Actra&apos;s local AI</h1>
            <p className="mt-1 text-sm leading-relaxed text-zinc-500">
              Actra prepares UI-TARS for local browser automation. The model stays on this device after download.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {status.files.map(file => (
            <div key={file.id} className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-zinc-800">{file.name}</div>
                <div className="mt-1 text-xs text-zinc-500">{file.installed ? 'Ready' : formatBytes(file.downloadedBytes)}</div>
              </div>
              {file.installed ? <img src="./app.png" alt="Ready" className="h-5 w-5 shrink-0 object-contain" /> : <Download className="h-5 w-5 shrink-0 text-orange-500" />}
            </div>
          ))}
        </div>

        {status.downloading && (
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold text-zinc-600">
              <span className="flex items-center gap-2"><ActraLoader size="sm" label="Downloading local models" /> Downloading local models...</span>
              <span>{percent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
              <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${percent}%` }} />
            </div>
          </div>
        )}

        {status.error && (
          <div className="mt-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{status.error}</span>
          </div>
        )}

        <button
          onClick={onDownload}
          disabled={status.downloading}
          className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:cursor-wait disabled:bg-zinc-300"
        >
          {status.downloading ? 'Downloading...' : status.error ? 'Retry Download' : 'Download and Continue'}
        </button>
        <button onClick={onSkip} disabled={status.downloading} className="mt-3 w-full py-2 text-xs font-medium text-zinc-500 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-50">
          Skip for now
        </button>
        <p className="mt-1 text-center text-[11px] text-zinc-400">Stored only in Actra dependencies. Existing files are skipped. Voice transcription continues to use Groq Cloud.</p>
      </div>
    </div>
  );
};
