import { create } from 'zustand';

export type UploadStatus = 'pending' | 'uploading' | 'success' | 'error';

const ACCEPTED_EXTENSIONS = [
  '.pdf', '.docx', '.doc', '.xlsx', '.csv', '.html', '.htm', '.md', '.txt',
];

export interface UploadTask {
  id: string;
  file: File;
  filename: string;
  size: number;
  status: UploadStatus;
  error?: string;
  chunksCount?: number;
}

interface UploadState {
  tasks: UploadTask[];
  isProcessing: boolean;
  skippedFiles: string[];

  addFiles: (files: File[]) => void;
  removeTask: (id: string) => void;
  clearCompleted: () => void;
  clearSkipped: () => void;
}

export const useUploadStore = create<UploadState>((set, get) => ({
  tasks: [],
  isProcessing: false,
  skippedFiles: [],

  addFiles: (files: File[]) => {
    const accepted: UploadTask[] = [];
    const skipped: string[] = [];

    for (const file of files) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (ACCEPTED_EXTENSIONS.includes(ext)) {
        accepted.push({
          id: crypto.randomUUID(),
          file,
          filename: file.name,
          size: file.size,
          status: 'pending',
        });
      } else {
        skipped.push(file.name);
      }
    }

    if (accepted.length === 0 && skipped.length > 0) {
      set((s) => ({ skippedFiles: [...s.skippedFiles, ...skipped] }));
      return;
    }

    set((s) => ({
      tasks: [...s.tasks, ...accepted],
      skippedFiles: skipped.length > 0 ? [...s.skippedFiles, ...skipped] : s.skippedFiles,
    }));

    // Auto-start queue if not already processing
    if (!get().isProcessing) {
      processQueue();
    }
  },

  removeTask: (id: string) => {
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
  },

  clearCompleted: () => {
    set((s) => ({
      tasks: s.tasks.filter((t) => t.status !== 'success' && t.status !== 'error'),
      skippedFiles: [],
    }));
  },

  clearSkipped: () => {
    set({ skippedFiles: [] });
  },
}));

async function processQueue() {
  const store = useUploadStore;

  store.setState({ isProcessing: true });

  while (true) {
    const { tasks } = store.getState();
    const next = tasks.find((t) => t.status === 'pending');
    if (!next) break;

    // Mark as uploading
    store.setState({
      tasks: store.getState().tasks.map((t) =>
        t.id === next.id ? { ...t, status: 'uploading' as UploadStatus } : t
      ),
    });

    try {
      const formData = new FormData();
      formData.append('file', next.file);

      const response = await fetch('http://localhost:8000/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: 'Upload failed' }));
        throw new Error(err.detail || `HTTP ${response.status}`);
      }

      const result = await response.json();

      store.setState({
        tasks: store.getState().tasks.map((t) =>
          t.id === next.id
            ? { ...t, status: 'success' as UploadStatus, chunksCount: result.chunks_count }
            : t
        ),
      });
    } catch (err) {
      store.setState({
        tasks: store.getState().tasks.map((t) =>
          t.id === next.id
            ? { ...t, status: 'error' as UploadStatus, error: err instanceof Error ? err.message : 'Upload failed' }
            : t
        ),
      });
    }
  }

  store.setState({ isProcessing: false });
}
