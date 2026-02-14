/**
 * Utility functions for formatting data
 */

export const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const formatTokenCount = (count: number): string => {
  if (count < 1000) return count.toString();
  if (count < 1000000) return `${(count / 1000).toFixed(1)}K`;
  return `${(count / 1000000).toFixed(1)}M`;
};

export const formatPercentage = (value: number): string => {
  return `${Math.round(value)}%`;
};

export const formatConfidence = (score: number): string => {
  return `${(score * 100).toFixed(1)}%`;
};

export const getConfidenceColor = (score: number): string => {
  if (score >= 0.7) return 'green';
  if (score >= 0.4) return 'yellow';
  return 'red';
};

export const getConfidenceTailwindClass = (score: number): string => {
  if (score >= 0.7) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  if (score >= 0.4) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
  return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
};
