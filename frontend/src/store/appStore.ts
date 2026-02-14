/**
 * Main application state store using Zustand
 */

import { create } from 'zustand';
import type { Message } from '../types/message';
import type { ContextMetadata, RuntimeContext } from '../types/api';
import type { AppSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../types/settings';

export type WSStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface AppState {
  // WebSocket
  ws: WebSocket | null;
  wsStatus: WSStatus;

  // Conversation
  messages: Message[];
  currentThreadId: string | null;
  isStreaming: boolean;
  currentNode: string | null;  // Current graph node being executed

  // Settings (maps to RuntimeContext)
  settings: AppSettings;

  // Metadata
  currentMetadata: ContextMetadata | null;

  // UI
  showSettings: boolean;
  errors: string[];
  warnings: string[];

  // Actions
  setWs: (ws: WebSocket | null) => void;
  setWsStatus: (status: WSStatus) => void;
  addMessage: (message: Message) => void;
  updateLastMessage: (updates: Partial<Message>) => void;
  clearMessages: () => void;
  setCurrentThreadId: (threadId: string | null) => void;
  setIsStreaming: (streaming: boolean) => void;
  setCurrentNode: (node: string | null) => void;
  updateSettings: (settings: Partial<AppSettings>) => void;
  loadSettings: () => void;
  saveSettings: () => void;
  setCurrentMetadata: (metadata: ContextMetadata | null) => void;
  setShowSettings: (show: boolean) => void;
  addError: (error: string) => void;
  addWarning: (warning: string) => void;
  clearErrors: () => void;
  clearWarnings: () => void;
  getRuntimeContext: () => RuntimeContext;
}

const SETTINGS_KEY = 'rag-settings-v1';

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  ws: null,
  wsStatus: 'disconnected',
  messages: [],
  currentThreadId: null,
  isStreaming: false,
  currentNode: null,
  settings: DEFAULT_SETTINGS,
  currentMetadata: null,
  showSettings: false,
  errors: [],
  warnings: [],

  // Actions
  setWs: (ws) => set({ ws }),

  setWsStatus: (wsStatus) => set({ wsStatus }),

  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message],
  })),

  updateLastMessage: (updates) => set((state) => {
    const messages = [...state.messages];
    if (messages.length > 0) {
      messages[messages.length - 1] = {
        ...messages[messages.length - 1],
        ...updates,
      };
    }
    return { messages };
  }),

  clearMessages: () => set({ messages: [], currentThreadId: null }),

  setCurrentThreadId: (currentThreadId) => set({ currentThreadId }),

  setIsStreaming: (isStreaming) => set({ isStreaming }),

  setCurrentNode: (currentNode) => set({ currentNode }),

  updateSettings: (newSettings) => set((state) => {
    const settings = { ...state.settings, ...newSettings };
    // Save to localStorage
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
    return { settings };
  }),

  loadSettings: () => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        const settings = JSON.parse(saved);
        set({ settings: { ...DEFAULT_SETTINGS, ...settings } });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  },

  saveSettings: () => {
    try {
      const { settings } = get();
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  },

  setCurrentMetadata: (currentMetadata) => set({ currentMetadata }),

  setShowSettings: (showSettings) => set({ showSettings }),

  addError: (error) => set((state) => ({
    errors: [...state.errors, error],
  })),

  addWarning: (warning) => set((state) => ({
    warnings: [...state.warnings, warning],
  })),

  clearErrors: () => set({ errors: [] }),

  clearWarnings: () => set({ warnings: [] }),

  getRuntimeContext: (): RuntimeContext => {
    const { settings } = get();
    return {
      language_preference: settings.language_preference === 'auto' ? null : settings.language_preference,
      expertise_level: settings.expertise_level,
      response_style: settings.response_style,
      enable_citations: settings.enable_citations,
      max_response_length: settings.max_response_length,
    };
  },
}));
