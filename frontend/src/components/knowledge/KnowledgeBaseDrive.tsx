/**
 * Google Drive-style Knowledge Base
 * Features: folder creation, file preview, RAG search
 */

import React, { useEffect, useState } from "react";
import {
  DocumentTextIcon,
  FolderIcon,
  FolderPlusIcon,
  MagnifyingGlassIcon,
  CloudArrowUpIcon,
  TrashIcon,
  EyeIcon,
  Squares2X2Icon,
  ListBulletIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

interface DocumentMetadata {
  document_id: string;
  filename: string;
  folder: string;
  file_type: string;
  size: number;
  chunks_count: number;
  created_at: string;
  last_modified: string;
  language: string | null;
}

interface KnowledgeBaseData {
  total_documents: number;
  total_chunks: number;
  total_size: number;
  documents: DocumentMetadata[];
}

interface RAGSearchResult {
  content: string;
  document_id: string;
  filename: string;
  score: number;
  metadata: Record<string, unknown>;
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getFileIcon = (fileType: string) => {
  const iconClass = "w-12 h-12";
  switch (fileType.toLowerCase()) {
    case "pdf":
      return (
        <div className="w-16 h-16 bg-red-500 rounded-xl flex items-center justify-center shadow-md">
          <DocumentTextIcon className={`${iconClass} text-white`} />
        </div>
      );
    case "docx":
    case "doc":
      return (
        <div className="w-16 h-16 bg-blue-500 rounded-xl flex items-center justify-center shadow-md">
          <DocumentTextIcon className={`${iconClass} text-white`} />
        </div>
      );
    case "xlsx":
    case "xls":
      return (
        <div className="w-16 h-16 bg-green-500 rounded-xl flex items-center justify-center shadow-md">
          <DocumentTextIcon className={`${iconClass} text-white`} />
        </div>
      );
    case "txt":
      return (
        <div className="w-16 h-16 bg-gray-500 rounded-xl flex items-center justify-center shadow-md">
          <DocumentTextIcon className={`${iconClass} text-white`} />
        </div>
      );
    default:
      return (
        <div className="w-16 h-16 bg-purple-500 rounded-xl flex items-center justify-center shadow-md">
          <DocumentTextIcon className={`${iconClass} text-white`} />
        </div>
      );
  }
};

export const KnowledgeBaseDrive: React.FC = () => {
  const [data, setData] = useState<KnowledgeBaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [ragSearchQuery, setRagSearchQuery] = useState("");
  const [ragResults, setRagResults] = useState<RAGSearchResult[]>([]);
  const [ragSearching, setRagSearching] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocumentMetadata | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [uploading, setUploading] = useState(false);

  const fetchKnowledgeBase = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        "http://localhost:8000/documents/knowledge-base",
      );
      if (!response.ok) throw new Error("Failed to fetch knowledge base");
      const result = await response.json();
      console.log("Fetched knowledge base data:", result);
      setData(result);
    } catch (err) {
      console.error("Failed to load knowledge base:", err);
      alert(`Error loading knowledge base: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKnowledgeBase();
  }, []);

  const handleRAGSearch = async () => {
    if (!ragSearchQuery.trim()) return;

    setRagSearching(true);
    try {
      const response = await fetch("http://localhost:8000/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: ragSearchQuery,
          top_k: 5,
        }),
      });
      if (!response.ok) throw new Error("RAG search failed");
      const result = await response.json();
      setRagResults(result.documents || []);
    } catch (err) {
      console.error("RAG search error:", err);
    } finally {
      setRagSearching(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm("Are you sure you want to delete this document?")) return;

    try {
      const response = await fetch(`http://localhost:8000/documents/${docId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete document");
      await fetchKnowledgeBase();
      if (selectedDoc?.document_id === docId) {
        setSelectedDoc(null);
        setShowPreview(false);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete document");
    }
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://localhost:8000/documents/upload", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Upload failed");
      await fetchKnowledgeBase();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    // TODO: Backend API for folder creation
    alert(`Folder "${newFolderName}" creation - coming soon!`);
    setNewFolderName("");
    setShowNewFolder(false);
  };

  const filteredDocs =
    data?.documents.filter((doc) =>
      doc.filename.toLowerCase().includes(searchQuery.toLowerCase()),
    ) || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-200 rounded-full animate-spin border-t-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Google Drive-style Header */}
      <header className="border-b border-gray-200 bg-white px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <FolderIcon className="w-8 h-8 text-blue-600" />
            <h1 className="text-2xl font-semibold text-gray-900">
              Knowledge Base
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Upload Button */}
            <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer transition-colors shadow-sm">
              <CloudArrowUpIcon className="w-5 h-5" />
              <span className="font-medium">
                {uploading ? "Uploading..." : "Upload"}
              </span>
              <input
                type="file"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
                accept=".pdf,.docx,.xlsx,.txt"
              />
            </label>

            {/* New Folder Button */}
            <button
              onClick={() => setShowNewFolder(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors"
            >
              <FolderPlusIcon className="w-5 h-5" />
              <span className="font-medium">New Folder</span>
            </button>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-2 rounded ${viewMode === "grid" ? "bg-white shadow-sm" : "hover:bg-gray-200"}`}
              >
                <Squares2X2Icon className="w-5 h-5 text-gray-700" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 rounded ${viewMode === "list" ? "bg-white shadow-sm" : "hover:bg-gray-200"}`}
              >
                <ListBulletIcon className="w-5 h-5 text-gray-700" />
              </button>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search in Drive"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-2.5 bg-gray-100 hover:bg-gray-200 focus:bg-white border border-transparent focus:border-blue-500 rounded-full outline-none transition-all"
            />
          </div>

          {/* RAG Search */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="RAG Search (AI-powered)"
              value={ragSearchQuery}
              onChange={(e) => setRagSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRAGSearch()}
              className="w-80 px-4 py-2.5 bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200 focus:border-purple-500 rounded-full outline-none transition-all"
            />
            <button
              onClick={handleRAGSearch}
              disabled={ragSearching}
              className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-full font-medium transition-all disabled:opacity-50"
            >
              {ragSearching ? "Searching..." : "Search"}
            </button>
          </div>
        </div>
      </header>

      {/* Stats Bar */}
      <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-6 text-sm text-gray-600 flex-shrink-0">
        <div>
          <span className="font-semibold text-gray-900">
            {data?.total_documents || 0}
          </span>{" "}
          documents
        </div>
        <div>
          <span className="font-semibold text-gray-900">
            {data?.total_chunks || 0}
          </span>{" "}
          chunks
        </div>
        <div>
          <span className="font-semibold text-gray-900">
            {formatFileSize(data?.total_size || 0)}
          </span>{" "}
          storage used
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* RAG Search Results */}
        {ragResults.length > 0 && (
          <div className="mb-6 bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                RAG Search Results ({ragResults.length})
              </h2>
              <button
                onClick={() => setRagResults([])}
                className="p-2 hover:bg-white rounded-lg transition-colors"
              >
                <XMarkIcon className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            <div className="space-y-3">
              {ragResults.map((result, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-xl p-4 border border-purple-100 shadow-sm"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <DocumentTextIcon className="w-5 h-5 text-purple-600" />
                      <span className="font-medium text-gray-900">
                        {result.filename}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-purple-600">
                      {Math.round(result.score * 100)}% match
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 line-clamp-2">
                    {result.content}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Documents Grid/List */}
        {viewMode === "grid" ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredDocs.map((doc) => (
              <div
                key={doc.document_id}
                className="group border border-gray-200 rounded-xl p-4 hover:border-blue-500 hover:shadow-md transition-all cursor-pointer bg-white"
                onClick={() => {
                  setSelectedDoc(doc);
                  setShowPreview(true);
                }}
              >
                <div className="flex flex-col items-center gap-3">
                  {getFileIcon(doc.file_type)}
                  <div className="w-full text-center">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {doc.filename}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatFileSize(doc.size)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedDoc(doc);
                        setShowPreview(true);
                      }}
                      className="p-2 bg-blue-50 hover:bg-blue-100 rounded-lg"
                    >
                      <EyeIcon className="w-4 h-4 text-blue-600" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(doc.document_id);
                      }}
                      className="p-2 bg-red-50 hover:bg-red-100 rounded-lg"
                    >
                      <TrashIcon className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Size
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Chunks
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Modified
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredDocs.map((doc) => (
                  <tr
                    key={doc.document_id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => {
                      setSelectedDoc(doc);
                      setShowPreview(true);
                    }}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0">
                          {getFileIcon(doc.file_type)}
                        </div>
                        <span className="text-sm font-medium text-gray-900">
                          {doc.filename}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full uppercase">
                        {doc.file_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatFileSize(doc.size)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {doc.chunks_count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDate(doc.last_modified)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDoc(doc);
                            setShowPreview(true);
                          }}
                          className="p-2 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <EyeIcon className="w-4 h-4 text-blue-600" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(doc.document_id);
                          }}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <TrashIcon className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredDocs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <FolderIcon className="w-20 h-20 mb-4" />
            <p className="text-lg font-medium">No documents found</p>
          </div>
        )}
      </div>

      {/* File Preview Modal */}
      {showPreview && selectedDoc && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                Document Preview
              </h2>
              <button
                onClick={() => setShowPreview(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <XMarkIcon className="w-6 h-6 text-gray-600" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              <div className="flex items-center gap-4 mb-6">
                {getFileIcon(selectedDoc.file_type)}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {selectedDoc.filename}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {selectedDoc.file_type.toUpperCase()} •{" "}
                    {formatFileSize(selectedDoc.size)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">Chunks</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {selectedDoc.chunks_count}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">Language</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {selectedDoc.language || "Auto"}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-gray-500">
                    Document ID
                  </p>
                  <p className="text-sm font-mono text-gray-900">
                    {selectedDoc.document_id}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Created</p>
                  <p className="text-sm text-gray-900">
                    {formatDate(selectedDoc.created_at)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Modified</p>
                  <p className="text-sm text-gray-900">
                    {formatDate(selectedDoc.last_modified)}
                  </p>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-200">
                <button
                  onClick={() => handleDelete(selectedDoc.document_id)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors font-medium"
                >
                  <TrashIcon className="w-5 h-5" />
                  Delete Document
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Folder Modal */}
      {showNewFolder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              New Folder
            </h2>
            <input
              type="text"
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
              className="w-full px-4 py-3 border-2 border-gray-300 focus:border-blue-500 rounded-lg outline-none mb-4"
              autoFocus
            />
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowNewFolder(false)}
                className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
