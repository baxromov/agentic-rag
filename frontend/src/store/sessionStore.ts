import { create } from "zustand";
import { API_BASE_URL } from "../config/api";
import { apiFetch } from "../config/apiClient";
import type { ChatSession } from "../types/session";

const ACTIVE_SESSION_KEY = "rag-active-session";

interface SessionState {
  sessions: ChatSession[];
  activeSessionId: string | null;
  isLoadingSessions: boolean;

  fetchSessions: () => Promise<void>;
  createSession: () => Promise<ChatSession | null>;
  selectSession: (id: string | null) => void;
  deleteSession: (id: string) => Promise<void>;
  updateSessionTitle: (id: string, title: string) => void;
  addOrUpdateSession: (session: ChatSession) => void;
  incrementMessageCount: (id: string) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  activeSessionId: localStorage.getItem(ACTIVE_SESSION_KEY),
  isLoadingSessions: false,

  fetchSessions: async () => {
    set({ isLoadingSessions: true });
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const res = await apiFetch(`${API_BASE_URL}/sessions`);
        if (res.ok) {
          const data: ChatSession[] = await res.json();
          set((state) => {
            // Validate activeSessionId — clear if it no longer exists on the server
            const activeId = state.activeSessionId;
            const stillExists =
              activeId && data.some((s) => s.thread_id === activeId);
            if (activeId && !stillExists) {
              localStorage.removeItem(ACTIVE_SESSION_KEY);
            }
            return {
              sessions: data,
              activeSessionId: stillExists ? activeId : null,
              isLoadingSessions: false,
            };
          });
          return;
        }
        // Non-OK response (e.g. 502 during startup) — retry
        if (attempt < maxRetries - 1) {
          await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        }
      } catch (e) {
        console.error("Failed to fetch sessions:", e);
        if (attempt < maxRetries - 1) {
          await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        }
      }
    }
    set({ isLoadingSessions: false });
  },

  createSession: async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/sessions`, {
        method: "POST",
      });
      if (res.ok) {
        const session: ChatSession = await res.json();
        set((s) => ({
          sessions: [session, ...s.sessions],
          activeSessionId: session.thread_id,
        }));
        localStorage.setItem(ACTIVE_SESSION_KEY, session.thread_id);
        return session;
      }
    } catch (e) {
      console.error("Failed to create session:", e);
    }
    return null;
  },

  selectSession: (id) => {
    set({ activeSessionId: id });
    if (id) {
      localStorage.setItem(ACTIVE_SESSION_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
    }
  },

  deleteSession: async (id) => {
    try {
      await apiFetch(`${API_BASE_URL}/sessions/${id}`, { method: "DELETE" });
      set((s) => {
        const newSessions = s.sessions.filter((x) => x.thread_id !== id);
        const newActive =
          s.activeSessionId === id ? null : s.activeSessionId;
        if (newActive === null) {
          localStorage.removeItem(ACTIVE_SESSION_KEY);
        }
        return { sessions: newSessions, activeSessionId: newActive };
      });
    } catch (e) {
      console.error("Failed to delete session:", e);
    }
  },

  updateSessionTitle: (id, title) => {
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.thread_id === id ? { ...x, title } : x,
      ),
    }));
  },

  addOrUpdateSession: (session) => {
    set((s) => {
      const idx = s.sessions.findIndex(
        (x) => x.thread_id === session.thread_id,
      );
      if (idx >= 0) {
        const updated = [...s.sessions];
        updated[idx] = { ...updated[idx], ...session };
        return { sessions: updated };
      }
      return { sessions: [session, ...s.sessions] };
    });
  },

  incrementMessageCount: (id) => {
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.thread_id === id
          ? { ...x, message_count: x.message_count + 2 }
          : x,
      ),
    }));
  },
}));
