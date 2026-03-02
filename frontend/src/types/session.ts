import type { SourceDocument } from "./api";

export interface ChatSession {
  thread_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface SessionMessage {
  role: "user" | "assistant";
  content: string;
  sources?: SourceDocument[];
}

export interface MessageFeedback {
  thread_id: string;
  message_index: number;
  rating: "up" | "down";
  note: string | null;
  created_at?: string;
  updated_at?: string;
}
