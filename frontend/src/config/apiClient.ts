import { API_BASE_URL } from "./api";

const AUTH_STORAGE_KEY = "rag-auth-v1";

/**
 * Logout callback — set by authStore on init to avoid circular imports.
 * When called, clears Zustand auth state → ProtectedRoute redirects to /login.
 */
let _logoutCallback: (() => void) | null = null;

export function registerLogoutCallback(cb: () => void) {
  _logoutCallback = cb;
}

function getTokens(): { access_token: string; refresh_token: string } | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data.tokens || null;
  } catch {
    return null;
  }
}

function setTokens(tokens: { access_token: string; refresh_token: string }) {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    data.tokens = tokens;
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

function forceLogout() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  if (_logoutCallback) {
    _logoutCallback();
  }
  // Always hard-redirect — don't rely on React re-render which can be blocked
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (isRefreshing && refreshPromise) return refreshPromise;

  isRefreshing = true;
  refreshPromise = (async () => {
    const tokens = getTokens();
    if (!tokens?.refresh_token) return false;

    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: tokens.refresh_token }),
      });

      if (!res.ok) return false;

      const data = await res.json();
      setTokens({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      return true;
    } catch {
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Fetch wrapper that automatically attaches JWT and handles 401 with token refresh.
 * On persistent auth failure, calls authStore.logout() via callback → React Router redirect.
 */
export async function apiFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const tokens = getTokens();

  // No tokens at all — force logout
  if (!tokens?.access_token) {
    forceLogout();
    return new Response(JSON.stringify({ detail: "Not authenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${tokens.access_token}`);

  let response = await fetch(url, { ...options, headers });

  // On 401, try refresh once
  if (response.status === 401 && tokens.refresh_token) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      const newTokens = getTokens();
      if (newTokens?.access_token) {
        headers.set("Authorization", `Bearer ${newTokens.access_token}`);
        response = await fetch(url, { ...options, headers });
      }
    }
  }

  // Still 401 after refresh attempt — force logout
  if (response.status === 401) {
    forceLogout();
  }

  return response;
}
