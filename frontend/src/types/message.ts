/**
 * Frontend message types for chat UI
 */

import type { ContextMetadata, SourceDocument } from './api';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  sources?: SourceDocument[];
  metadata?: ContextMetadata;
  isStreaming?: boolean;
  error?: string;
}

export interface MessageOptions {
  role: MessageRole;
  content: string;
  sources?: SourceDocument[];
  metadata?: ContextMetadata;
}
