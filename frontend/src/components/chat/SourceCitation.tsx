/**
 * Source citation display with expandable accordion and document preview
 */

import { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon, ArrowDownTrayIcon, EyeIcon, XMarkIcon } from '@heroicons/react/24/outline';
import type { SourceDocument } from '../../types/api';
import { Badge } from '../common/Badge';
import { API_BASE_URL } from '../../config/api';
import { apiFetch } from '../../config/apiClient';

interface SourceCitationProps {
  sources: SourceDocument[];
}

export const SourceCitation: React.FC<SourceCitationProps> = ({ sources }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<SourceDocument | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [chunks, setChunks] = useState<{ chunk_index: number; text: string; page_number: number | null }[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);

  if (sources.length === 0) return null;

  const isPdf = (source: string | null | undefined) =>
    source?.toLowerCase().endsWith('.pdf') ?? false;

  const openDocPreview = async (source: SourceDocument) => {
    if (!source.document_id) return;
    setPreviewDoc(source);
    setPdfBlobUrl(null);
    setChunks([]);

    if (isPdf(source.source)) {
      setPdfLoading(true);
      try {
        const res = await apiFetch(`${API_BASE_URL}/documents/${source.document_id}/preview`);
        if (!res.ok) throw new Error('Failed');
        const blob = await res.blob();
        setPdfBlobUrl(URL.createObjectURL(blob));
      } catch {
        setPdfBlobUrl(null);
      } finally {
        setPdfLoading(false);
      }
    } else {
      setChunksLoading(true);
      try {
        const res = await apiFetch(`${API_BASE_URL}/documents/${source.document_id}/chunks`);
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        setChunks(data.chunks || []);
      } catch {
        setChunks([]);
      } finally {
        setChunksLoading(false);
      }
    }
  };

  const closePreview = () => {
    setPreviewDoc(null);
    if (pdfBlobUrl) {
      URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(null);
    }
    setChunks([]);
  };

  const handleDownload = async (docId: string, filename: string) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/documents/${docId}/download`);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  return (
    <>
      <div className="w-full bg-input/50 rounded-lg border border-border-default">
        {/* Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between p-3 hover:bg-input rounded-lg transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-secondary">
              Sources
            </span>
            <Badge variant="info" size="sm">
              {sources.length}
            </Badge>
          </div>
          {isExpanded ? (
            <ChevronUpIcon className="h-4 w-4 text-text-muted" />
          ) : (
            <ChevronDownIcon className="h-4 w-4 text-text-muted" />
          )}
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="px-3 pb-3 space-y-2">
            {sources.map((source, index) => (
              <div
                key={index}
                className="p-3 bg-card rounded border border-border-default"
              >
                {/* Source metadata row */}
                <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Filename as clickable download link */}
                    {source.source && (
                      source.document_id ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(source.document_id!, source.source || 'document');
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded transition-colors max-w-[200px] truncate"
                          title={source.source}
                        >
                          <ArrowDownTrayIcon className="h-3 w-3 flex-shrink-0" />
                          {source.source}
                        </button>
                      ) : (
                        <Badge variant="default" size="sm">{source.source}</Badge>
                      )
                    )}
                    {source.page_number !== null && source.page_number !== undefined && (
                      <Badge variant="default" size="sm">
                        Page {source.page_number}
                      </Badge>
                    )}
                    {source.language && (
                      <Badge variant="default" size="sm">
                        {source.language.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {source.score !== null && source.score !== undefined && (
                      <Badge variant="info" size="sm">
                        Score: {source.score.toFixed(3)}
                      </Badge>
                    )}
                    {source.document_id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openDocPreview(source);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-purple-400 hover:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded transition-colors"
                      >
                        <EyeIcon className="h-3 w-3" />
                        Preview
                      </button>
                    )}
                  </div>
                </div>

                {/* Full chunk text */}
                <p className="text-sm text-text-secondary whitespace-pre-wrap break-words">
                  {source.text}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6">
          <div className="bg-card border border-border-default rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border-default flex-shrink-0">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-text-primary truncate">
                  {previewDoc.source || 'Document'}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  {previewDoc.page_number != null && (
                    <span className="text-xs text-text-secondary">Page {previewDoc.page_number}</span>
                  )}
                  {previewDoc.language && (
                    <span className="text-xs text-text-secondary uppercase">{previewDoc.language}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {previewDoc.document_id && (
                  <button
                    onClick={() => handleDownload(previewDoc.document_id!, previewDoc.source || 'document')}
                    className="p-2 hover:bg-input rounded-lg transition-colors"
                    title="Download"
                  >
                    <ArrowDownTrayIcon className="w-5 h-5 text-blue-400" />
                  </button>
                )}
                <button
                  onClick={closePreview}
                  className="p-2 hover:bg-input rounded-lg transition-colors"
                >
                  <XMarkIcon className="w-5 h-5 text-text-secondary" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {isPdf(previewDoc.source) ? (
                pdfLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="text-center">
                      <div className="w-10 h-10 border-4 border-border-default rounded-full animate-spin border-t-blue-500 mx-auto mb-3"></div>
                      <p className="text-text-secondary text-sm">Loading PDF...</p>
                    </div>
                  </div>
                ) : pdfBlobUrl ? (
                  <iframe
                    src={pdfBlobUrl}
                    className="w-full h-[70vh] border-0"
                    title={`Preview: ${previewDoc.source}`}
                  />
                ) : (
                  <div className="flex items-center justify-center h-64 text-text-muted">
                    <p>Failed to load PDF</p>
                  </div>
                )
              ) : chunksLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <div className="w-10 h-10 border-4 border-border-default rounded-full animate-spin border-t-blue-500 mx-auto mb-3"></div>
                    <p className="text-text-secondary text-sm">Loading content...</p>
                  </div>
                </div>
              ) : chunks.length > 0 ? (
                <div className="p-5 space-y-1">
                  {chunks.map((chunk, idx) => (
                    <div key={chunk.chunk_index}>
                      {chunk.page_number != null && (idx === 0 || chunks[idx - 1]?.page_number !== chunk.page_number) && (
                        <div className="flex items-center gap-2 mt-3 mb-2 first:mt-0">
                          <div className="h-px flex-1 bg-hover"></div>
                          <span className="text-xs text-text-muted font-medium">Page {chunk.page_number}</span>
                          <div className="h-px flex-1 bg-hover"></div>
                        </div>
                      )}
                      <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
                        {chunk.text}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 text-text-muted">
                  <p>No content available</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
