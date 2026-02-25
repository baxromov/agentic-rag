import { create } from "zustand";
import { API_BASE_URL } from "../config/api";

export type UploadStatus = "pending" | "uploading" | "success" | "error";

const ACCEPTED_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".doc",
  ".xlsx",
  ".csv",
  ".html",
  ".htm",
  ".md",
  ".txt",
];

const STORAGE_KEY = "upload-tasks-v1";

export interface UploadTask {
  id: string;
  file: File;
  filename: string;
  size: number;
  status: UploadStatus;
  error?: string;
  chunksCount?: number;
  skipped?: boolean;
}

/** Serializable subset of UploadTask (File objects can't be persisted) */
interface PersistedTask {
  id: string;
  filename: string;
  size: number;
  status: UploadStatus;
  error?: string;
  chunksCount?: number;
  skipped?: boolean;
}

function saveTasks(tasks: UploadTask[]) {
  try {
    const serializable: PersistedTask[] = tasks.map(
      ({ id, filename, size, status, error, chunksCount, skipped }) => ({
        id,
        filename,
        size,
        status,
        error,
        chunksCount,
        skipped,
      }),
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch {
    // localStorage full or unavailable
  }
}

function loadTasks(): UploadTask[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const persisted: PersistedTask[] = JSON.parse(raw);

    // Restore tasks: pending/uploading become "error" (interrupted) since File is lost
    return persisted.map((t) => ({
      ...t,
      file: null as unknown as File, // File object is lost after refresh
      status:
        t.status === "pending" || t.status === "uploading"
          ? ("error" as UploadStatus)
          : t.status,
      error:
        t.status === "pending" || t.status === "uploading"
          ? "Upload interrupted — please re-upload this file"
          : t.error,
    }));
  } catch {
    return [];
  }
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

const restoredTasks = loadTasks();

export const useUploadStore = create<UploadState>((set, get) => ({
  tasks: restoredTasks,
  isProcessing: false,
  skippedFiles: [],

  addFiles: (files: File[]) => {
    const accepted: UploadTask[] = [];
    const skipped: string[] = [];

    for (const file of files) {
      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      if (ACCEPTED_EXTENSIONS.includes(ext)) {
        accepted.push({
          id: crypto.randomUUID(),
          file,
          filename: file.name,
          size: file.size,
          status: "pending",
        });
      } else {
        skipped.push(file.name);
      }
    }

    if (accepted.length === 0 && skipped.length > 0) {
      set((s) => ({ skippedFiles: [...s.skippedFiles, ...skipped] }));
      return;
    }

    set((s) => {
      const newTasks = [...s.tasks, ...accepted];
      saveTasks(newTasks);
      return {
        tasks: newTasks,
        skippedFiles:
          skipped.length > 0
            ? [...s.skippedFiles, ...skipped]
            : s.skippedFiles,
      };
    });

    // Auto-start queue if not already processing
    if (!get().isProcessing) {
      processQueue();
    }
  },

  removeTask: (id: string) => {
    set((s) => {
      const newTasks = s.tasks.filter((t) => t.id !== id);
      saveTasks(newTasks);
      return { tasks: newTasks };
    });
  },

  clearCompleted: () => {
    set((s) => {
      const newTasks = s.tasks.filter(
        (t) => t.status !== "success" && t.status !== "error",
      );
      saveTasks(newTasks);
      return {
        tasks: newTasks,
        skippedFiles: [],
      };
    });
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
    const next = tasks.find((t) => t.status === "pending");
    if (!next) break;

    // Mark as uploading
    const uploadingTasks = store
      .getState()
      .tasks.map((t) =>
        t.id === next.id ? { ...t, status: "uploading" as UploadStatus } : t,
      );
    store.setState({ tasks: uploadingTasks });
    saveTasks(uploadingTasks);

    try {
      const formData = new FormData();
      formData.append("file", next.file);

      const response = await fetch(`${API_BASE_URL}/documents/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const err = await response
          .json()
          .catch(() => ({ detail: "Upload failed" }));
        throw new Error(err.detail || `HTTP ${response.status}`);
      }

      const result = await response.json();

      const successTasks = store.getState().tasks.map((t) =>
        t.id === next.id
          ? {
              ...t,
              status: "success" as UploadStatus,
              chunksCount: result.chunks_count,
              skipped: result.skipped || false,
            }
          : t,
      );
      store.setState({ tasks: successTasks });
      saveTasks(successTasks);
    } catch (err) {
      const errorTasks = store.getState().tasks.map((t) =>
        t.id === next.id
          ? {
              ...t,
              status: "error" as UploadStatus,
              error: err instanceof Error ? err.message : "Upload failed",
            }
          : t,
      );
      store.setState({ tasks: errorTasks });
      saveTasks(errorTasks);
    }
  }

  store.setState({ isProcessing: false });
}
