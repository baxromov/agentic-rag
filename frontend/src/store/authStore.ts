import { create } from "zustand";
import { API_BASE_URL } from "../config/api";
import { registerLogoutCallback } from "../config/apiClient";
import { useSessionStore } from "./sessionStore";
import type { User, TokenResponse } from "../types/auth";

const AUTH_STORAGE_KEY = "rag-auth-v1";

interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  loadFromStorage: () => Promise<void>;
  fetchMe: () => Promise<void>;
}

function saveToStorage(user: User, tokens: AuthTokens) {
  try {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ user, tokens }),
    );
  } catch {
    // ignore
  }
}

function clearStorage() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

function loadStorage(): { user: User; tokens: AuthTokens } | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.user && data.tokens) return data;
    return null;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  tokens: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  login: async (username: string, password: string): Promise<boolean> => {
    set({ error: null, isLoading: true });
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Login failed" }));
        set({ error: err.detail || "Login failed", isLoading: false });
        return false;
      }

      const data: TokenResponse = await res.json();
      const tokens: AuthTokens = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      };

      saveToStorage(data.user, tokens);
      set({
        user: data.user,
        tokens,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
      return true;
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Network error",
        isLoading: false,
      });
      return false;
    }
  },

  logout: () => {
    clearStorage();
    // Clear session store to prevent 403 errors when switching users
    useSessionStore.getState().selectSession(null);
    useSessionStore.setState({ sessions: [] });
    set({
      user: null,
      tokens: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  },

  loadFromStorage: async () => {
    const stored = loadStorage();
    if (!stored) {
      set({ isLoading: false });
      return;
    }

    // Keep isLoading: true — don't set isAuthenticated until validated.
    // This prevents components from rendering and firing API calls with expired tokens.

    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${stored.tokens.access_token}` },
      });

      if (res.ok) {
        const user: User = await res.json();
        saveToStorage(user, stored.tokens);
        set({
          user,
          tokens: stored.tokens,
          isAuthenticated: true,
          isLoading: false,
        });
      } else if (res.status === 401) {
        // Access token expired — try refresh
        const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            refresh_token: stored.tokens.refresh_token,
          }),
        });

        if (refreshRes.ok) {
          const data: TokenResponse = await refreshRes.json();
          const newTokens: AuthTokens = {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
          };
          saveToStorage(data.user, newTokens);
          set({
            user: data.user,
            tokens: newTokens,
            isAuthenticated: true,
            isLoading: false,
          });
        } else {
          clearStorage();
          set({
            user: null,
            tokens: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      } else {
        // Other error (5xx, etc.) — don't trust stored state, force re-login
        clearStorage();
        set({
          user: null,
          tokens: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    } catch {
      // Network error (backend unreachable) — don't trust stored state
      clearStorage();
      set({
        user: null,
        tokens: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  fetchMe: async () => {
    const { tokens } = get();
    if (!tokens) return;

    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (res.ok) {
        const user: User = await res.json();
        set({ user });
        saveToStorage(user, tokens);
      }
    } catch {
      // ignore
    }
  },
}));

// Register logout callback so apiClient can trigger auth state change on 401
registerLogoutCallback(() => {
  useAuthStore.getState().logout();
});
