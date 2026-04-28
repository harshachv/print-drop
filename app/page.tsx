'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabase, BUCKET } from '@/lib/supabase';

interface FileItem {
  name: string;
  displayName: string;
  size: number;
  updatedAt: string;
  url: string;
}

const MAX_STORAGE = 500 * 1024 * 1024;

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelative(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function FileTypeIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'heic'].includes(ext);
  const isPdf = ext === 'pdf';

  return (
    <div className="w-9 h-9 shrink-0 rounded-lg bg-stone-100 flex items-center justify-center">
      {isImage ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-stone-500">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="1.5" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
      ) : isPdf ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-stone-500">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <text x="8" y="17" fontSize="5" fontWeight="600" fill="currentColor" stroke="none">PDF</text>
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-stone-500">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="13" x2="15" y2="13" />
          <line x1="9" y1="17" x2="15" y2="17" />
        </svg>
      )}
    </div>
  );
}

const IconPrinter = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" rx="1" />
  </svg>
);

const IconDownload = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
  </svg>
);

const IconUpload = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

export default function Home() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadName, setUploadName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [totalSize, setTotalSize] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await getSupabase().storage.from(BUCKET).list('', {
        sortBy: { column: 'created_at', order: 'desc' },
      });
      if (error || !data) return;

      const ONE_DAY_MS = 24 * 60 * 60 * 1000;
      const now = Date.now();

      const expired = data.filter((f) => {
        if (f.name === '.emptyFolderPlaceholder') return false;
        const created = new Date(f.created_at ?? f.updated_at ?? 0).getTime();
        return now - created > ONE_DAY_MS;
      });

      if (expired.length > 0) {
        await getSupabase().storage.from(BUCKET).remove(expired.map((f) => f.name));
      }

      const fresh = data.filter(
        (f) => f.name !== '.emptyFolderPlaceholder' && !expired.includes(f)
      );

      const items: FileItem[] = fresh.map((f) => {
        const { data: urlData } = getSupabase().storage.from(BUCKET).getPublicUrl(f.name);
        const displayName = f.name.replace(/^\d+_/, '');
        return {
          name: f.name,
          displayName,
          size: f.metadata?.size ?? 0,
          updatedAt: f.updated_at ?? f.created_at ?? '',
          url: urlData.publicUrl,
        };
      });

      setFiles(items);
      setTotalSize(items.reduce((sum, f) => sum + f.size, 0));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleUpload = useCallback(
    async (file: File) => {
      if (totalSize + file.size > MAX_STORAGE) {
        alert('Storage limit reached (500 MB).');
        return;
      }

      setUploading(true);
      setUploadProgress(0);
      setUploadName(file.name);

      const interval = setInterval(() => {
        setUploadProgress((p) => Math.min(p + 5, 85));
      }, 300);

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${Date.now()}_${safeName}`;
      const { error } = await getSupabase().storage.from(BUCKET).upload(path, file);

      clearInterval(interval);

      if (error) {
        setUploading(false);
        setUploadProgress(0);
        setUploadName('');
        alert(`Upload failed: ${error.message}`);
        return;
      }

      setUploadProgress(100);
      await loadFiles();
      setUploading(false);
      setUploadProgress(0);
      setUploadName('');
    },
    [totalSize, loadFiles]
  );

  const handleDelete = async (file: FileItem) => {
    setDeletingKey(file.name);
    try {
      await getSupabase().storage.from(BUCKET).remove([file.name]);
      await loadFiles();
    } finally {
      setDeletingKey(null);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  const usagePercent = Math.min((totalSize / MAX_STORAGE) * 100, 100);

  return (
    <main className="min-h-screen bg-[#fafaf9]">
      <div className="max-w-[560px] mx-auto px-6 pt-20 pb-16">

        {/* Header */}
        <header className="mb-12">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-7 h-7 rounded-lg bg-stone-900 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </div>
            <h1 className="text-[17px] font-semibold tracking-tight text-stone-900">Prdrop</h1>
          </div>
          <p className="text-[13px] text-stone-500 leading-relaxed">
            Drop a file. Print it from any browser. Files clear themselves after 24 hours.
          </p>
        </header>

        {/* Storage indicator */}
        <section className="mb-6">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-[12px] text-stone-500 tabular-nums">
              <span className="text-stone-900 font-medium">{formatSize(totalSize)}</span>
              <span className="mx-1.5 text-stone-300">/</span>
              500 MB
            </span>
            <span className="text-[11px] text-stone-400 tabular-nums">{Math.round(usagePercent)}%</span>
          </div>
          <div className="h-[3px] bg-stone-200/70 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${usagePercent}%`,
                background: usagePercent > 85 ? '#dc2626' : '#1c1917',
              }}
            />
          </div>
        </section>

        {/* Upload zone */}
        <section
          className={`mb-8 rounded-2xl p-12 text-center cursor-pointer select-none transition-all duration-200 border ${
            dragging
              ? 'border-stone-900 bg-stone-900/5 ring-4 ring-stone-900/5'
              : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50/50'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => !uploading && inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
          />

          {uploading ? (
            <div className="space-y-4">
              <p className="text-[13px] text-stone-700 font-medium truncate max-w-[280px] mx-auto">{uploadName}</p>
              <div className="h-[2px] bg-stone-100 rounded-full overflow-hidden max-w-[220px] mx-auto">
                <div
                  className="h-full bg-stone-900 rounded-full transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-[11px] text-stone-400 tabular-nums">{Math.round(uploadProgress)}%</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                dragging ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'
              }`}>
                <IconUpload />
              </div>
              <div>
                <p className="text-[14px] font-medium text-stone-900">
                  {dragging ? 'Release to upload' : 'Drop a file or click to browse'}
                </p>
                <p className="text-[12px] text-stone-400 mt-1">PDF, image, or document up to 500 MB</p>
              </div>
            </div>
          )}
        </section>

        {/* File list */}
        <section>
          {!loading && files.length > 0 && (
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-[11px] font-medium text-stone-400 uppercase tracking-wider">
                Files
              </h2>
              <span className="text-[11px] text-stone-400 tabular-nums">{files.length}</span>
            </div>
          )}

          {loading ? (
            <div className="text-[13px] text-stone-400 text-center py-12">Loading…</div>
          ) : files.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-[13px] text-stone-400">No files yet</p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {files.map((file) => (
                <li
                  key={file.name}
                  className="group flex items-center gap-3 bg-white border border-stone-200/70 rounded-xl px-3 py-2.5 hover:border-stone-300 transition-colors"
                >
                  <FileTypeIcon name={file.displayName} />

                  <div className="flex-1 min-w-0 mr-2">
                    <p className="text-[13px] font-medium text-stone-900 truncate leading-tight">{file.displayName}</p>
                    <p className="text-[11px] text-stone-400 mt-0.5 tabular-nums">
                      {formatSize(file.size)} · {formatRelative(file.updatedAt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Print"
                      className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-md transition-colors"
                    >
                      <IconPrinter />
                    </a>
                    <a
                      href={file.url}
                      download={file.displayName}
                      title="Download"
                      className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-md transition-colors"
                    >
                      <IconDownload />
                    </a>
                    <button
                      onClick={() => handleDelete(file)}
                      disabled={deletingKey === file.name}
                      title="Delete"
                      className="p-2 text-stone-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-40"
                    >
                      <IconTrash />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Footer */}
        <footer className="mt-16 pt-6 border-t border-stone-200/60">
          <p className="text-[11px] text-stone-400 text-center">
            Files are publicly accessible via direct URL · Auto-deleted after 24h
          </p>
        </footer>
      </div>
    </main>
  );
}
