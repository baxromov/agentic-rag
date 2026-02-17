/**
 * Google Drive-style Knowledge Base
 * Features: folder creation, file preview, RAG search
 */

import React, { useEffect, useRef, useState } from "react";
import {
  DocumentTextIcon,
  FolderIcon,
  FolderPlusIcon,
  FolderArrowDownIcon,
  MagnifyingGlassIcon,
  CloudArrowUpIcon,
  TrashIcon,
  EyeIcon,
  Squares2X2Icon,
  ListBulletIcon,
  XMarkIcon,
  DocumentArrowUpIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import { useUploadStore } from "../../store/uploadStore";

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
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const uploadMenuRef = useRef<HTMLDivElement>(null);
  const { addFiles, tasks, isProcessing } = useUploadStore();

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

  const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    addFiles(Array.from(files));
    event.target.value = "";
    setShowUploadMenu(false);
  };

  // Refresh knowledge base when uploads finish
  const prevProcessingRef = useRef(isProcessing);
  useEffect(() => {
    if (
      prevProcessingRef.current &&
      !isProcessing &&
      tasks.some((t) => t.status === "success")
    ) {
      fetchKnowledgeBase();
    }
    prevProcessingRef.current = isProcessing;
  }, [isProcessing, tasks]);

  // Close upload menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        uploadMenuRef.current &&
        !uploadMenuRef.current.contains(e.target as Node)
      ) {
        setShowUploadMenu(false);
      }
    };
    if (showUploadMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showUploadMenu]);

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
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
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-slate-700 rounded-full animate-spin border-t-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-400 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <FolderIcon className="w-8 h-8 text-blue-400" />
            <h1 className="text-2xl font-semibold text-slate-100">
              Knowledge Base
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Upload Button with Dropdown */}
            <div className="relative" ref={uploadMenuRef}>
              <button
                onClick={() => setShowUploadMenu(!showUploadMenu)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer transition-colors shadow-sm"
              >
                <CloudArrowUpIcon className="w-5 h-5" />
                <span className="font-medium">Upload</span>
                <ChevronDownIcon className="w-4 h-4 ml-1" />
              </button>
              {showUploadMenu && (
                <div className="absolute right-0 mt-2 w-52 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20 overflow-hidden">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 text-slate-200 transition-colors text-left"
                  >
                    <DocumentArrowUpIcon className="w-5 h-5 text-blue-400" />
                    <div>
                      <p className="text-sm font-medium">Upload Files</p>
                      <p className="text-xs text-slate-400">
                        Select one or more files
                      </p>
                    </div>
                  </button>
                  <button
                    onClick={() => folderInputRef.current?.click()}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 text-slate-200 transition-colors text-left border-t border-slate-700"
                  >
                    <FolderArrowDownIcon className="w-5 h-5 text-purple-400" />
                    <div>
                      <p className="text-sm font-medium">Upload Folder</p>
                      <p className="text-xs text-slate-400">
                        Upload entire folder
                      </p>
                    </div>
                  </button>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFilesSelected}
                className="hidden"
                accept=".pdf,.docx,.doc,.xlsx,.csv,.html,.htm,.md,.txt"
              />
              <input
                ref={folderInputRef}
                type="file"
                onChange={handleFilesSelected}
                className="hidden"
                {...({
                  webkitdirectory: "",
                  directory: "",
                } as React.InputHTMLAttributes<HTMLInputElement>)}
              />
            </div>

            {/* New Folder Button */}
            <button
              onClick={() => setShowNewFolder(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
            >
              <FolderPlusIcon className="w-5 h-5" />
              <span className="font-medium">New Folder</span>
            </button>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-2 rounded ${viewMode === "grid" ? "bg-slate-700 shadow-sm" : "hover:bg-slate-700"}`}
              >
                <Squares2X2Icon className="w-5 h-5 text-slate-300" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 rounded ${viewMode === "list" ? "bg-slate-700 shadow-sm" : "hover:bg-slate-700"}`}
              >
                <ListBulletIcon className="w-5 h-5 text-slate-300" />
              </button>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input
              type="text"
              placeholder="Search in Drive"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-2.5 bg-slate-800 hover:bg-slate-750 focus:bg-slate-800 border border-slate-700 focus:border-blue-500 rounded-full outline-none transition-all text-slate-200 placeholder:text-slate-500"
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
              className="w-80 px-4 py-2.5 bg-purple-900/20 border-2 border-purple-700/50 focus:border-purple-500 rounded-full outline-none transition-all text-slate-200 placeholder:text-slate-500"
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
      <div className="px-6 py-3 bg-slate-900/50 border-b border-slate-800 flex items-center gap-6 text-sm text-slate-400 flex-shrink-0">
        <div>
          <span className="font-semibold text-slate-200">
            {data?.total_documents || 0}
          </span>{" "}
          documents
        </div>
        <div>
          <span className="font-semibold text-slate-200">
            {data?.total_chunks || 0}
          </span>{" "}
          chunks
        </div>
        <div>
          <span className="font-semibold text-slate-200">
            {formatFileSize(data?.total_size || 0)}
          </span>{" "}
          storage used
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* RAG Search Results */}
        {ragResults.length > 0 && (
          <div className="mb-6 bg-purple-900/20 border-2 border-purple-700/50 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-100">
                RAG Search Results ({ragResults.length})
              </h2>
              <button
                onClick={() => setRagResults([])}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <XMarkIcon className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="space-y-3">
              {ragResults.map((result, idx) => (
                <div
                  key={idx}
                  className="bg-slate-800 rounded-xl p-4 border border-slate-700 shadow-sm"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <DocumentTextIcon className="w-5 h-5 text-purple-400" />
                      <span className="font-medium text-slate-100">
                        {result.filename}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-purple-400">
                      {Math.round(result.score * 100)}% match
                    </span>
                  </div>
                  <p className="text-sm text-slate-300 line-clamp-2">
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
                className="group border border-slate-800 rounded-xl p-4 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/5 transition-all cursor-pointer bg-slate-900"
                onClick={() => {
                  setSelectedDoc(doc);
                  setShowPreview(true);
                }}
              >
                <div className="flex flex-col items-center gap-3">
                  {getFileIcon(doc.file_type)}
                  <div className="w-full text-center">
                    <p className="text-sm font-medium text-slate-200 truncate">
                      {doc.filename}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
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
                      className="p-2 bg-blue-600/20 hover:bg-blue-600/30 rounded-lg"
                    >
                      <EyeIcon className="w-4 h-4 text-blue-400" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(doc.document_id);
                      }}
                      className="p-2 bg-red-600/20 hover:bg-red-600/30 rounded-lg"
                    >
                      <TrashIcon className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-slate-900 rounded-xl border border-slate-800">
            <table className="w-full">
              <thead className="bg-slate-800/50 border-b border-slate-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    Size
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    Chunks
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    Modified
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredDocs.map((doc) => (
                  <tr
                    key={doc.document_id}
                    className="hover:bg-slate-800/50 cursor-pointer"
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
                        <span className="text-sm font-medium text-slate-200">
                          {doc.filename}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-3 py-1 bg-slate-800 text-slate-300 text-xs font-medium rounded-full uppercase">
                        {doc.file_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                      {formatFileSize(doc.size)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                      {doc.chunks_count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
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
                          className="p-2 hover:bg-blue-600/20 rounded-lg transition-colors"
                        >
                          <EyeIcon className="w-4 h-4 text-blue-400" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(doc.document_id);
                          }}
                          className="p-2 hover:bg-red-600/20 rounded-lg transition-colors"
                        >
                          <TrashIcon className="w-4 h-4 text-red-400" />
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
          <div className="flex flex-col items-center justify-center h-64 text-slate-500">
            <FolderIcon className="w-20 h-20 mb-4" />
            <p className="text-lg font-medium">No documents found</p>
          </div>
        )}
      </div>

      {/* File Preview Modal */}
      {showPreview && selectedDoc && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-800">
              <h2 className="text-xl font-semibold text-slate-100">
                Document Preview
              </h2>
              <button
                onClick={() => setShowPreview(false)}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <XMarkIcon className="w-6 h-6 text-slate-400" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              <div className="flex items-center gap-4 mb-6">
                {getFileIcon(selectedDoc.file_type)}
                <div>
                  <h3 className="text-lg font-semibold text-slate-100">
                    {selectedDoc.filename}
                  </h3>
                  <p className="text-sm text-slate-400">
                    {selectedDoc.file_type.toUpperCase()} •{" "}
                    {formatFileSize(selectedDoc.size)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-800 rounded-lg p-4">
                  <p className="text-xs text-slate-500 mb-1">Chunks</p>
                  <p className="text-2xl font-semibold text-slate-100">
                    {selectedDoc.chunks_count}
                  </p>
                </div>
                <div className="bg-slate-800 rounded-lg p-4">
                  <p className="text-xs text-slate-500 mb-1">Language</p>
                  <p className="text-2xl font-semibold text-slate-100">
                    {selectedDoc.language || "Auto"}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-slate-500">
                    Document ID
                  </p>
                  <p className="text-sm font-mono text-slate-200">
                    {selectedDoc.document_id}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500">Created</p>
                  <p className="text-sm text-slate-200">
                    {formatDate(selectedDoc.created_at)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500">Modified</p>
                  <p className="text-sm text-slate-200">
                    {formatDate(selectedDoc.last_modified)}
                  </p>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-slate-800">
                <button
                  onClick={() => handleDelete(selectedDoc.document_id)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors font-medium border border-red-500/30"
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
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-xl font-semibold text-slate-100 mb-4">
              New Folder
            </h2>
            <input
              type="text"
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
              className="w-full px-4 py-3 border-2 border-slate-700 focus:border-blue-500 rounded-lg outline-none mb-4 bg-slate-800 text-slate-200 placeholder:text-slate-500"
              autoFocus
            />
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowNewFolder(false)}
                className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium transition-colors"
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
