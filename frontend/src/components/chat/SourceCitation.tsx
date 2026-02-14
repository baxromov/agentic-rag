/**
 * Source citation display with expandable accordion
 */

import { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import type { SourceDocument } from '../../types/api';
import { Badge } from '../common/Badge';

interface SourceCitationProps {
  sources: SourceDocument[];
}

export const SourceCitation: React.FC<SourceCitationProps> = ({ sources }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (sources.length === 0) return null;

  return (
    <div className="w-full bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
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
              className="p-3 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700"
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
              </div>

              {/* Text preview */}
              <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-3">
                {source.text}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
