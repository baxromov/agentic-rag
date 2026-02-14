/**
 * API types matching backend models from /src/models/schemas.py
 */

// -- Runtime Context --
export interface RuntimeContext {
  user_id?: string | null;
  language_preference?: 'en' | 'ru' | 'uz' | 'auto' | null;
  expertise_level?: 'beginner' | 'intermediate' | 'expert' | 'general';
  response_style?: 'concise' | 'detailed' | 'balanced';
  enable_citations?: boolean;
  max_response_length?: number | null;
}

// -- Documents --
export interface SourceDocument {
  text: string;
  score?: number | null;
  page_number?: number | null;
  source?: string | null;
  language?: string | null;
}

export interface DocumentUploadResponse {
  document_id: string;
  source: string;
  chunks_count: number;
}

export interface DocumentInfo {
  key: string;
  size: number;
  last_modified: string;
}

export interface DocumentListResponse {
  documents: DocumentInfo[];
}

export interface DocumentDeleteResponse {
  document_id: string;
  deleted: boolean;
}

// -- Query --
export interface QueryRequest {
  query: string;
  filters?: Record<string, unknown> | null;
  top_k?: number | null;
  context?: RuntimeContext | null;
}

export interface QueryResponse {
  answer: string;
  sources: SourceDocument[];
  query: string;
  retries: number;
}

// -- Context Metadata (from context_manager.py) --
export interface ContextMetadata {
  model_name: string;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  context_window: number;
  context_usage_percent: number;
  documents_count: number;
  documents_total_tokens: number;
  confidence_score?: number | null;
  query_language?: string | null;
  query_type?: string | null;
  warnings?: string[];
}

// -- Chat (WebSocket) --
export interface ChatMessage {
  query: string;
  filters?: Record<string, unknown> | null;
  context?: RuntimeContext | null;
  thread_id?: string | null;  // For multi-turn conversations
}

export type ChatEventType =
  | 'warning'
  | 'error'
  | 'node_start'
  | 'node_end'
  | 'generation';

export interface ChatEvent {
  event: ChatEventType;
  node?: string | null;
  data?: {
    message?: string;
    warnings?: string[];
    answer?: string;
    sources?: SourceDocument[];
    sources_count?: number;
    context_metadata?: ContextMetadata;
    thread_id?: string;
    retries?: number;
    [key: string]: unknown;
  } | null;
}

// -- WebSocket Request --
export interface WSRequest {
  query: string;
  filters?: Record<string, unknown> | null;
  context?: RuntimeContext | null;
  thread_id?: string | null;
}

// -- Health --
export interface HealthResponse {
  status: string;
  minio: boolean;
  qdrant: boolean;
  collection_info?: Record<string, unknown> | null;
}
