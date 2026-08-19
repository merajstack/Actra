import React from 'react';
import { DownloadItem } from '../types';
import { Download, Trash2, ArrowLeft, FolderOpen, CheckCircle, Image as ImageIcon } from 'lucide-react';

interface DownloadsPageProps {
  downloads: DownloadItem[];
  onClearDownloads: () => void;
  onBackToBrowser: () => void;
}

export const DownloadsPage: React.FC<DownloadsPageProps> = ({
  downloads,
  onClearDownloads,
  onBackToBrowser,
}) => {
  const isImageDownload = (item: DownloadItem) =>
    item.mimeType?.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(item.filename);

  const toFileUrl = (path?: string) => {
    if (!path) return undefined;
    if (/^(file|https?):\/\//i.test(path)) return path;
    return `file://${path.split('/').map(encodeURIComponent).join('/')}`;
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
            <h1 className="text-2xl font-bold text-zinc-800 font-serif">Downloads</h1>
            <p className="text-xs text-zinc-500">Files downloaded through Actra Browser</p>
          </div>
        </div>

        {downloads.length > 0 && (
          <button
            onClick={onClearDownloads}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 font-semibold text-xs transition-colors cursor-pointer border border-red-200"
          >
            <Trash2 className="w-4 h-4" />
            <span>Clear History</span>
          </button>
        )}
      </div>

      {/* Downloads List */}
      <div className="max-w-4xl w-full mx-auto p-8 space-y-4">
        {downloads.length === 0 ? (
          <div className="text-center py-20 text-zinc-400">
            <Download className="w-12 h-12 mx-auto mb-3 opacity-40 text-orange-500" />
            <p className="text-sm font-medium">No downloads yet.</p>
          </div>
        ) : (
          downloads.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-4 rounded-2xl bg-white border border-[#EBE5D8] hover:border-orange-300 hover:shadow-md transition-all group"
            >
              <div className="flex items-center space-x-4 flex-1 truncate mr-4">
                <div className="w-12 h-12 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0 overflow-hidden">
                  {isImageDownload(item) && item.localPath ? (
                    <img src={toFileUrl(item.localPath)} alt="" className="w-full h-full object-cover" />
                  ) : isImageDownload(item) ? (
                    <ImageIcon className="w-5 h-5" />
                  ) : (
                    <Download className="w-5 h-5" />
                  )}
                </div>
                <div className="truncate flex-1">
                  <div className="text-xs font-bold text-zinc-800 truncate">{item.filename}</div>
                  <div className="text-[11px] text-zinc-400 truncate flex items-center space-x-2 mt-0.5">
                    <span>{item.fileSize}</span>
                    <span>•</span>
                    <span className="text-emerald-600 font-semibold flex items-center space-x-1">
                      <CheckCircle className="w-3 h-3 inline mr-0.5" /> Completed
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-zinc-100 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div className="bg-orange-500 h-full rounded-full w-full" />
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <button
                  onClick={() => alert(`Showing "${item.filename}" in Finder / system downloads folder`)}
                  className="flex items-center space-x-1 px-3 py-2 rounded-xl bg-[#F5F0E6] hover:bg-[#EAE4D6] text-zinc-700 font-medium text-xs transition-colors cursor-pointer border border-[#E2DAD0]"
                >
                  <FolderOpen className="w-4 h-4" />
                  <span>Show in Finder</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
