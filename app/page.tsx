'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { storage } from '@/lib/firebase';
import {
  ref,
  uploadBytesResumable,
  listAll,
  getDownloadURL,
  deleteObject,
  getMetadata,
} from 'firebase/storage';

interface FileItem {
  name: string;
  displayName: string;
  size: number;
  updatedAt: string;
  url: string;
  storageRef: ReturnType<typeof ref>;
}

const MAX_STORAGE = 500 * 1024 * 1024;

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return '📄';
  if (['doc', 'docx'].includes(ext ?? '')) return '📝';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext ?? '')) return '🖼️';
  if (['xls', 'xlsx'].includes(ext ?? '')) return '📊';
  return '📁';
}

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
      const listRef = ref(storage, 'files/');
      const result = await listAll(listRef);

      const items = await Promise.all(
        result.items.map(async (item) => {
          const [url, meta] = await Promise.all([getDownloadURL(item), getMetadata(item)]);
          const displayName = meta.name.replace(/^\d+_/, '');
          return {
            name: meta.name,
            displayName,
            size: meta.size,
            updatedAt: meta.updated,
            url,
            storageRef: item,
          };
        })
      );

      items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setFiles(items);
      setTotalSize(items.reduce((sum, f) => sum + f.size, 0));
    } catch {
      // storage not configured yet
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
        alert('Storage limit reached (500 MB). Delete some files first.');
        return;
      }

      setUploading(true);
      setUploadProgress(0);
      setUploadName(file.name);

      const fileRef = ref(storage, `files/${Date.now()}_${file.name}`);
      const task = uploadBytesResumable(fileRef, file);

      task.on(
        'state_changed',
        (snap) => setUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100),
        () => setUploading(false),
        () => {
          setUploading(false);
          setUploadProgress(0);
          setUploadName('');
          loadFiles();
        }
      );
    },
    [totalSize, loadFiles]
  );

  const handleDelete = async (file: FileItem) => {
    setDeletingKey(file.name);
    try {
      await deleteObject(file.storageRef);
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
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto px-5 py-14">

        {/* Header */}
        <div className="mb-10">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">PrintDrop</h1>
          <p className="text-sm text-gray-400 mt-1">Upload · Print · Delete</p>
        </div>

        {/* Storage bar */}
        <div className="mb-8">
          <div className="flex justify-between text-xs text-gray-400 mb-2">
            <span>{formatSize(totalSize)} used</span>
            <span>500 MB limit</span>
          </div>
          <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${usagePercent}%`,
                background: usagePercent > 85 ? '#f87171' : '#3b82f6',
              }}
            />
          </div>
        </div>

        {/* Upload zone */}
        <div
          className={`mb-8 border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer select-none transition-all duration-150 ${
            dragging
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
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
            <div className="space-y-3">
              <p className="text-sm text-gray-500 truncate max-w-xs mx-auto">{uploadName}</p>
              <div className="h-1 bg-gray-100 rounded-full overflow-hidden max-w-[200px] mx-auto">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-xs text-gray-400">{Math.round(uploadProgress)}%</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-3xl">↑</p>
              <p className="text-sm font-medium text-gray-700">Drop a file here</p>
              <p className="text-xs text-gray-400">or click to browse</p>
            </div>
          )}
        </div>

        {/* File list */}
        {loading ? (
          <div className="text-sm text-gray-400 text-center py-10">Loading...</div>
        ) : files.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-10">No files yet.</div>
        ) : (
          <ul className="space-y-2">
            {files.map((file) => (
              <li
                key={file.name}
                className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3"
              >
                <span className="text-xl shrink-0">{fileIcon(file.displayName)}</span>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{file.displayName}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatSize(file.size)} · {formatDate(file.updatedAt)}
                  </p>
                </div>

                <a
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors shrink-0"
                >
                  Print
                </a>

                <button
                  onClick={() => handleDelete(file)}
                  disabled={deletingKey === file.name}
                  className="text-xs font-medium text-red-400 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0 disabled:opacity-40"
                >
                  {deletingKey === file.name ? '…' : 'Delete'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
