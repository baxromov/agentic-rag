import React, { useState, useEffect } from 'react';
import {
  XMarkIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  DocumentTextIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { useUploadStore, type UploadTask } from '../../store/uploadStore';

const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

const StatusIcon: React.FC<{ status: UploadTask['status'] }> = ({ status }) => {
  switch (status) {
    case 'pending':
      return <div className="w-4 h-4 rounded-full border-2 border-slate-600" />;
    case 'uploading':
      return (
        <div className="w-4 h-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
      );
    case 'success':
      return <CheckCircleIcon className="w-5 h-5 text-green-400" />;
    case 'error':
      return <ExclamationCircleIcon className="w-5 h-5 text-red-400" />;
  }
};

export const UploadToast: React.FC = () => {
  const { tasks, isProcessing, skippedFiles, clearCompleted, clearSkipped } = useUploadStore();
  const [collapsed, setCollapsed] = useState(false);
  const [visible, setVisible] = useState(false);

  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === 'success').length;
  const errors = tasks.filter((t) => t.status === 'error').length;
  const uploading = tasks.find((t) => t.status === 'uploading');
  const allDone = total > 0 && !isProcessing && !tasks.some((t) => t.status === 'pending' || t.status === 'uploading');

  // Show/hide based on tasks
  useEffect(() => {
    if (tasks.length > 0 || skippedFiles.length > 0) {
      setVisible(true);
    }
  }, [tasks.length, skippedFiles.length]);

  // Auto-hide 8s after all done
  useEffect(() => {
    if (allDone && tasks.length > 0) {
      const timer = setTimeout(() => {
        clearCompleted();
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [allDone, tasks.length, clearCompleted]);

  // Hide when no tasks and no skipped files
  useEffect(() => {
    if (tasks.length === 0 && skippedFiles.length === 0) {
      setVisible(false);
    }
  }, [tasks.length, skippedFiles.length]);

  if (!visible) return null;

  // Header text
  let headerText: string;
  if (allDone) {
    headerText = errors > 0
      ? `Done: ${completed} uploaded, ${errors} failed`
      : `All ${completed} files uploaded`;
  } else if (uploading) {
    headerText = `Uploading ${completed + 1}/${total}...`;
  } else {
    headerText = `${total} files queued`;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-h-[70vh] flex flex-col bg-slate-900 border border-slate-700 rounded-xl shadow-2xl shadow-black/40 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700 cursor-pointer select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-3">
          {isProcessing && (
            <div className="w-4 h-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
          )}
          {allDone && errors === 0 && (
            <CheckCircleIcon className="w-5 h-5 text-green-400" />
          )}
          {allDone && errors > 0 && (
            <ExclamationCircleIcon className="w-5 h-5 text-amber-400" />
          )}
          <span className="text-sm font-medium text-slate-200">{headerText}</span>
        </div>
        <div className="flex items-center gap-1">
          {allDone && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearCompleted();
              }}
              className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 transition-colors"
              title="Clear all"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          )}
          {collapsed ? (
            <ChevronUpIcon className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDownIcon className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </div>

      {/* File list */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto max-h-80">
          {/* Skipped files warning */}
          {skippedFiles.length > 0 && (
            <div className="px-4 py-2 bg-amber-900/20 border-b border-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-xs text-amber-400">
                  {skippedFiles.length} file(s) skipped (unsupported format)
                </span>
                <button
                  onClick={clearSkipped}
                  className="text-xs text-slate-500 hover:text-slate-300"
                >
                  dismiss
                </button>
              </div>
              <div className="mt-1 text-xs text-slate-500 truncate">
                {skippedFiles.slice(0, 3).join(', ')}
                {skippedFiles.length > 3 && ` +${skippedFiles.length - 3} more`}
              </div>
            </div>
          )}

          {/* Task list */}
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800 last:border-b-0 hover:bg-slate-800/50"
            >
              <StatusIcon status={task.status} />
              <DocumentTextIcon className="w-4 h-4 text-slate-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-300 truncate">{task.filename}</p>
                <p className="text-xs text-slate-500">
                  {formatSize(task.size)}
                  {task.status === 'success' && task.skipped && (
                    <span className="text-amber-400"> - already exists, skipped</span>
                  )}
                  {task.status === 'success' && !task.skipped && task.chunksCount !== undefined && (
                    <span className="text-green-400"> - {task.chunksCount} chunks</span>
                  )}
                  {task.status === 'error' && task.error && (
                    <span className="text-red-400"> - {task.error}</span>
                  )}
                </p>
              </div>
              {(task.status === 'success' || task.status === 'error') && (
                <button
                  onClick={() => useUploadStore.getState().removeTask(task.id)}
                  className="p-1 hover:bg-slate-700 rounded text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"
                >
                  <XMarkIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
