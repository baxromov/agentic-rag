/**
 * Source citation display with expandable accordion
 */

import { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import type { SourceDocument } from '../../types/api';
import { Badge } from '../common/Badge';
import { API_BASE_URL } from '../../config/api';

interface SourceCitationProps {
  sources: SourceDocument[];
}

export const SourceCitation: React.FC<SourceCitationProps> = ({ sources }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (sources.length === 0) return null;

  return (
    <div className="w-full bg-slate-800/50 rounded-lg border border-slate-700">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-slate-800 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-300">
            Sources
          </span>
          <Badge variant="info" size="sm">
            {sources.length}
          </Badge>
        </div>
        {isExpanded ? (
          <ChevronUpIcon className="h-4 w-4 text-slate-500" />
        ) : (
          <ChevronDownIcon className="h-4 w-4 text-slate-500" />
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {sources.map((source, index) => (
            <div
              key={index}
              className="p-3 bg-slate-900 rounded border border-slate-700"
            >
              {/* Source metadata */}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {source.source && (
                  <Badge variant="default" size="sm">
                    {source.source}
                  </Badge>
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
                {source.score !== null && source.score !== undefined && (
                  <Badge variant="info" size="sm">
                    Score: {source.score.toFixed(3)}
                  </Badge>
                )}
                {source.document_id && (
                  <a
                    href={`${API_BASE_URL}/documents/${source.document_id}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ArrowDownTrayIcon className="h-3 w-3" />
                    Download
                  </a>
                )}
              </div>

              {/* Text preview */}
              <p className="text-sm text-slate-300 line-clamp-3">
                {source.text}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
