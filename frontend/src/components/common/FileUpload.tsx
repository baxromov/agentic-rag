/**
 * File upload component for document ingestion
 */

import { useState } from 'react';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { Button } from './Button';
import { ErrorAlert } from './ErrorAlert';

interface FileUploadProps {
  onUploadSuccess?: (result: {
    document_id: string;
    source: string;
    chunks_count: number;
  }) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onUploadSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
      setSuccess(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('http://localhost:8000/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Upload failed');
      }

      const result = await response.json();
      setSuccess(
        `Successfully uploaded "${result.source}" (${result.chunks_count} chunks created)`
      );
      setFile(null);

      // Reset file input
      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      if (onUploadSuccess) {
        onUploadSuccess(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
        Upload Document
      </h3>

      {/* File Input */}
      <div className="mb-4">
        <label
          htmlFor="file-upload"
          className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
        >
          Choose File (PDF, DOCX, TXT)
        </label>
        <input
          id="file-upload"
          type="file"
          accept=".pdf,.docx,.txt,.md"
          onChange={handleFileChange}
          disabled={uploading}
          className="block w-full text-sm text-slate-500 dark:text-slate-400
            file:mr-4 file:py-2 file:px-4
            file:rounded-lg file:border-0
            file:text-sm file:font-semibold
            file:bg-blue-50 file:text-blue-700
            dark:file:bg-blue-900/20 dark:file:text-blue-300
            hover:file:bg-blue-100 dark:hover:file:bg-blue-900/30
            file:cursor-pointer cursor-pointer
            disabled:opacity-50 disabled:cursor-not-allowed"
        />
        {file && (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
          </p>
        )}
      </div>

      {/* Upload Button */}
      <Button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="w-full"
      >
        {uploading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Uploading...
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <ArrowUpTrayIcon className="h-5 w-5" />
            Upload Document
          </span>
        )}
      </Button>

      {/* Error Message */}
      {error && (
        <div className="mt-4">
          <ErrorAlert type="error" message={error} onClose={() => setError(null)} />
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="mt-4">
          <ErrorAlert type="info" message={success} onClose={() => setSuccess(null)} />
        </div>
      )}

      {/* Info */}
      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
        Supported formats: PDF, DOCX, TXT, Markdown. Documents will be chunked and
        indexed for retrieval.
      </p>
    </div>
  );
};
