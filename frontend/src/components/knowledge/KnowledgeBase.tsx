import React, { useEffect, useState } from "react";
import {
  DocumentTextIcon,
  FolderIcon,
  FolderOpenIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  CircleStackIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  DocumentIcon,
  CloudArrowUpIcon,
  ServerIcon,
  ClockIcon,
  CalendarIcon,
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

interface FolderNode {
  name: string;
  path: string;
  type: "folder" | "file";
  children: FolderNode[];
  metadata: DocumentMetadata | null;
}

interface KnowledgeBaseData {
  total_documents: number;
  total_chunks: number;
  total_size: number;
  documents: DocumentMetadata[];
  folder_tree: FolderNode[];
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
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const getFileIcon = (fileType: string) => {
  switch (fileType.toLowerCase()) {
    case "pdf":
      return (
        <div className="w-8 h-8 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center shadow-sm">
          <DocumentTextIcon className="w-5 h-5 text-white" />
        </div>
      );
    case "docx":
    case "doc":
      return (
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-sm">
          <DocumentTextIcon className="w-5 h-5 text-white" />
        </div>
      );
    case "xlsx":
    case "xls":
      return (
        <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center shadow-sm">
          <DocumentTextIcon className="w-5 h-5 text-white" />
        </div>
      );
    case "txt":
      return (
        <div className="w-8 h-8 bg-gradient-to-br from-gray-500 to-gray-600 rounded-lg flex items-center justify-center shadow-sm">
          <DocumentTextIcon className="w-5 h-5 text-white" />
        </div>
      );
    default:
      return (
        <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center shadow-sm">
          <DocumentIcon className="w-5 h-5 text-white" />
        </div>
      );
  }
};

const FileTreeNode: React.FC<{
  node: FolderNode;
  level: number;
  onDelete: (docId: string) => void;
  selectedDoc: string | null;
  onSelect: (doc: DocumentMetadata | null) => void;
}> = ({ node, level, onDelete, selectedDoc, onSelect }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (node.type === "file" && node.metadata) {
    const isSelected = selectedDoc === node.metadata.document_id;
    return (
      <div
        className={`group flex items-center gap-3 py-2.5 px-3 rounded-xl cursor-pointer transition-all duration-200 ${
          isSelected
            ? "bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 shadow-sm"
            : "hover:bg-gray-50 border border-transparent"
        }`}
        style={{ paddingLeft: `${level * 20 + 12}px` }}
        onClick={() => onSelect(node.metadata)}
      >
        {getFileIcon(node.metadata.file_type)}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">
            {node.name}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-500">
              {formatFileSize(node.metadata.size)}
            </span>
            <span className="text-xs text-gray-400">•</span>
            <span className="text-xs text-gray-500">
              {node.metadata.chunks_count}{" "}
              {node.metadata.chunks_count === 1 ? "chunk" : "chunks"}
            </span>
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(node.metadata!.document_id);
          }}
          className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 rounded-lg transition-all duration-200"
          title="Delete document"
        >
          <TrashIcon className="w-4 h-4 text-red-500" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
        className="flex items-center gap-2 py-2 px-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
        style={{ paddingLeft: `${level * 20 + 12}px` }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDownIcon className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRightIcon className="w-4 h-4 text-gray-400" />
        )}
        {isExpanded ? (
          <FolderOpenIcon className="w-5 h-5 text-yellow-500" />
        ) : (
          <FolderIcon className="w-5 h-5 text-yellow-500" />
        )}
        <span className="text-sm font-semibold text-gray-700">{node.name}</span>
        <span className="text-xs text-gray-400">({node.children.length})</span>
      </div>
      {isExpanded && (
        <div className="mt-1">
          {node.children.map((child, idx) => (
            <FileTreeNode
              key={`${child.path}-${idx}`}
              node={child}
              level={level + 1}
              onDelete={onDelete}
              selectedDoc={selectedDoc}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const KnowledgeBase: React.FC = () => {
  const [data, setData] = useState<KnowledgeBaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<DocumentMetadata | null>(null);
  const [uploading, setUploading] = useState(false);

  const fetchKnowledgeBase = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(
        "http://localhost:8000/documents/knowledge-base",
      );
      if (!response.ok) throw new Error("Failed to fetch knowledge base");
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKnowledgeBase();
  }, []);

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

  const filteredTree = data?.folder_tree.filter((node) =>
    node.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-blue-200 rounded-full animate-spin border-t-blue-600 mx-auto"></div>
            <CircleStackIcon className="w-8 h-8 text-blue-600 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
          </div>
          <p className="text-gray-600 font-medium mt-4">
            Loading knowledge base...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="bg-white border border-red-200 rounded-2xl shadow-xl p-8 max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ServerIcon className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="text-red-900 font-bold text-lg mb-2 text-center">
            Connection Error
          </h3>
          <p className="text-red-600 text-center mb-6">{error}</p>
          <button
            onClick={fetchKnowledgeBase}
            className="w-full px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-xl hover:from-red-700 hover:to-red-800 font-medium transition-all shadow-lg hover:shadow-xl"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-gray-50 via-white to-gray-50">
      {/* Modern Header with Gradient */}
      <div className="bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-600 shadow-lg">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-1 flex items-center gap-3">
                <CircleStackIcon className="w-8 h-8" />
                Knowledge Base
              </h1>
              <p className="text-blue-100">
                Manage your documents and training data
              </p>
            </div>

            {/* Stats Cards */}
            <div className="flex gap-4">
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl px-6 py-4 min-w-[140px]">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <DocumentTextIcon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="text-blue-100 text-xs font-medium uppercase tracking-wide">
                      Documents
                    </div>
                    <div className="text-3xl font-bold text-white">
                      {data?.total_documents || 0}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl px-6 py-4 min-w-[140px]">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <ServerIcon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="text-blue-100 text-xs font-medium uppercase tracking-wide">
                      Chunks
                    </div>
                    <div className="text-3xl font-bold text-white">
                      {data?.total_chunks || 0}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl px-6 py-4 min-w-[140px]">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <CircleStackIcon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="text-blue-100 text-xs font-medium uppercase tracking-wide">
                      Storage
                    </div>
                    <div className="text-2xl font-bold text-white">
                      {formatFileSize(data?.total_size || 0)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden p-6 gap-6">
        {/* Sidebar - Modern Card Design */}
        <div className="w-96 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-gray-100 space-y-4 bg-gradient-to-b from-gray-50 to-white">
            {/* Search with Icon */}
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm font-medium"
              />
            </div>

            {/* Upload Button - Gradient Style */}
            <label className="group relative flex items-center justify-center gap-3 px-6 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 cursor-pointer transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5">
              <CloudArrowUpIcon className="w-5 h-5" />
              <span className="font-semibold">
                {uploading ? "Uploading..." : "Upload Document"}
              </span>
              {uploading && (
                <div className="absolute inset-0 bg-white/20 rounded-xl flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
              <input
                type="file"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
                accept=".pdf,.docx,.xlsx,.txt"
              />
            </label>
          </div>

          {/* File Tree with Custom Scrollbar */}
          <div className="flex-1 overflow-y-auto p-4 space-y-1">
            {filteredTree && filteredTree.length > 0 ? (
              filteredTree.map((node, idx) => (
                <FileTreeNode
                  key={`${node.path}-${idx}`}
                  node={node}
                  level={0}
                  onDelete={handleDelete}
                  selectedDoc={selectedDoc?.document_id || null}
                  onSelect={setSelectedDoc}
                />
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <DocumentTextIcon className="w-10 h-10 text-gray-300" />
                </div>
                <p className="text-lg font-medium text-gray-500">
                  No documents found
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  Upload your first document to get started
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Details Panel - Modern Card */}
        <div className="flex-1 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          {selectedDoc ? (
            <div className="h-full flex flex-col">
              {/* Document Header */}
              <div className="bg-gradient-to-br from-gray-50 to-white p-8 border-b border-gray-100">
                <div className="flex items-start gap-4 mb-6">
                  {getFileIcon(selectedDoc.file_type)}
                  <div className="flex-1 min-w-0">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2 truncate">
                      {selectedDoc.filename}
                    </h2>
                    <div className="flex items-center gap-3 text-sm text-gray-500">
                      <span className="px-3 py-1 bg-gray-100 rounded-full font-medium uppercase">
                        {selectedDoc.file_type}
                      </span>
                      <span>•</span>
                      <span className="font-mono text-xs">
                        {selectedDoc.document_id.slice(0, 8)}...
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(selectedDoc.document_id)}
                    className="group flex items-center gap-2 px-5 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-all border border-red-200 hover:border-red-300"
                  >
                    <TrashIcon className="w-4 h-4" />
                    <span className="font-medium">Delete</span>
                  </button>
                </div>
              </div>

              {/* Document Details Grid */}
              <div className="flex-1 overflow-y-auto p-8">
                <h3 className="text-lg font-bold text-gray-900 mb-4">
                  Document Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-100">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                        <DocumentTextIcon className="w-5 h-5 text-white" />
                      </div>
                      <div className="text-sm font-medium text-blue-900">
                        File Size
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-blue-900">
                      {formatFileSize(selectedDoc.size)}
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-5 border border-green-100">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                        <ServerIcon className="w-5 h-5 text-white" />
                      </div>
                      <div className="text-sm font-medium text-green-900">
                        Chunks
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-green-900">
                      {selectedDoc.chunks_count}
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-5 border border-purple-100">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
                        <CalendarIcon className="w-5 h-5 text-white" />
                      </div>
                      <div className="text-sm font-medium text-purple-900">
                        Created
                      </div>
                    </div>
                    <div className="text-lg font-semibold text-purple-900">
                      {formatDate(selectedDoc.created_at)}
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-5 border border-orange-100">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                        <ClockIcon className="w-5 h-5 text-white" />
                      </div>
                      <div className="text-sm font-medium text-orange-900">
                        Modified
                      </div>
                    </div>
                    <div className="text-lg font-semibold text-orange-900">
                      {formatDate(selectedDoc.last_modified)}
                    </div>
                  </div>
                </div>

                {/* Full Details */}
                <div className="mt-6 bg-gray-50 rounded-xl p-6 border border-gray-200">
                  <h4 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wide">
                    Technical Details
                  </h4>
                  <div className="space-y-3">
                    <div className="flex justify-between py-2 border-b border-gray-200">
                      <span className="text-sm font-medium text-gray-600">
                        Document ID
                      </span>
                      <span className="text-sm font-mono text-gray-900">
                        {selectedDoc.document_id}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-gray-200">
                      <span className="text-sm font-medium text-gray-600">
                        Folder Path
                      </span>
                      <span className="text-sm font-mono text-gray-900">
                        {selectedDoc.folder}
                      </span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-sm font-medium text-gray-600">
                        Language
                      </span>
                      <span className="text-sm text-gray-900">
                        {selectedDoc.language || "Auto-detected"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <div className="w-32 h-32 bg-gradient-to-br from-gray-100 to-gray-200 rounded-3xl flex items-center justify-center mb-6 shadow-inner">
                <DocumentTextIcon className="w-16 h-16 text-gray-300" />
              </div>
              <p className="text-xl font-semibold text-gray-500 mb-2">
                No Document Selected
              </p>
              <p className="text-sm text-gray-400">
                Select a document from the list to view its details
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
