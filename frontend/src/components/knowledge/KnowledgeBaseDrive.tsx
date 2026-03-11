/**
 * Google Drive-style Knowledge Base
 * Features: folder creation, file preview, paginated document list
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
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
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { useUploadStore } from "../../store/uploadStore";
import { useAuthStore } from "../../store/authStore";
import { API_BASE_URL } from "../../config/api";
import { apiFetch } from "../../config/apiClient";

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
  page: number;
  page_size: number;
  total_pages: number;
}

const PAGE_SIZE = 20;

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
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedDoc, setSelectedDoc] = useState<DocumentMetadata | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewTab, setPreviewTab] = useState<"preview" | "details">("preview");
  const [chunks, setChunks] = useState<{ chunk_index: number; text: string; page_number: number | null; language: string | null }[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const uploadMenuRef = useRef<HTMLDivElement>(null);
  const { addFiles, tasks, isProcessing } = useUploadStore();
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [resyncing, setResyncing] = useState(false);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchKnowledgeBase = useCallback(async (page = 1, search = "") => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE),
      });
      if (search.trim()) params.set("search", search.trim());
      const response = await apiFetch(`${API_BASE_URL}/documents/knowledge-base?${params}`);
      if (!response.ok) throw new Error("Failed to fetch knowledge base");
      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error("Failed to load knowledge base:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKnowledgeBase(currentPage, debouncedSearch);
  }, [currentPage, debouncedSearch, fetchKnowledgeBase]);

  const isPdf = (doc: DocumentMetadata) => doc.file_type.toLowerCase() === "pdf";

  const fetchChunks = async (docId: string) => {
    setChunksLoading(true);
    try {
      const response = await apiFetch(`${API_BASE_URL}/documents/${docId}/chunks`);
      if (!response.ok) throw new Error("Failed to fetch chunks");
      const result = await response.json();
      setChunks(result.chunks || []);
    } catch (err) {
      console.error("Failed to fetch chunks:", err);
      setChunks([]);
    } finally {
      setChunksLoading(false);
    }
  };

  const fetchPdfBlob = async (docId: string) => {
    setPdfLoading(true);
    try {
      const response = await apiFetch(`${API_BASE_URL}/documents/${docId}/preview`);
      if (!response.ok) throw new Error("Failed to fetch PDF");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setPdfBlobUrl(url);
    } catch (err) {
      console.error("Failed to fetch PDF preview:", err);
      setPdfBlobUrl(null);
    } finally {
      setPdfLoading(false);
    }
  };

  const openPreview = (doc: DocumentMetadata) => {
    setSelectedDoc(doc);
    setShowPreview(true);
    setPreviewTab("preview");
    setChunks([]);
    setPdfBlobUrl(null);
    if (isPdf(doc)) {
      fetchPdfBlob(doc.document_id);
    } else {
      fetchChunks(doc.document_id);
    }
  };

  const closePreview = () => {
    setShowPreview(false);
    if (pdfBlobUrl) {
      URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(null);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm("Are you sure you want to delete this document?")) return;

    try {
      const response = await apiFetch(`${API_BASE_URL}/documents/${docId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete document");
      await fetchKnowledgeBase(currentPage, debouncedSearch);
      if (selectedDoc?.document_id === docId) {
        setSelectedDoc(null);
        setShowPreview(false);
      }
    } catch (err) {
      console.error("Failed to delete document:", err);
    }
  };

  const toggleSelection = (docId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === documents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(documents.map((d) => d.document_id)));
    }
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} document(s)?`)) return;

    setBulkDeleting(true);
    try {
      const response = await apiFetch(`${API_BASE_URL}/documents/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_ids: Array.from(selectedIds) }),
      });
      if (!response.ok) throw new Error("Bulk delete failed");
      exitSelectionMode();
      await fetchKnowledgeBase(currentPage, debouncedSearch);
    } catch (err) {
      console.error("Bulk delete failed:", err);
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleResync = async () => {
    if (selectedIds.size === 0) return;
    if (
      !confirm(
        `Re-chunk and resync ${selectedIds.size} document(s) with the vector database? This will re-parse, re-chunk, and re-embed the selected files.`,
      )
    )
      return;

    setResyncing(true);
    try {
      const response = await apiFetch(`${API_BASE_URL}/documents/resync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_ids: Array.from(selectedIds) }),
      });
      if (!response.ok) throw new Error("Resync failed");
      const result = await response.json();
      const failed = result.results?.filter(
        (r: { status: string }) => r.status === "failed",
      );
      if (failed?.length > 0) {
        alert(
          `Resync completed. ${failed.length} document(s) failed:\n${failed.map((f: { document_id: string; error: string }) => `${f.document_id}: ${f.error}`).join("\n")}`,
        );
      }
      exitSelectionMode();
      await fetchKnowledgeBase(currentPage, debouncedSearch);
    } catch (err) {
      console.error("Resync failed:", err);
    } finally {
      setResyncing(false);
    }
  };

  const handleDownload = async (doc: DocumentMetadata) => {
    try {
      const response = await apiFetch(
        `${API_BASE_URL}/documents/${doc.document_id}/download`,
      );
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
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
      fetchKnowledgeBase(currentPage, debouncedSearch);
    }
    prevProcessingRef.current = isProcessing;
  }, [isProcessing, tasks, currentPage, debouncedSearch, fetchKnowledgeBase]);

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

  const documents = data?.documents || [];
  const totalPages = data?.total_pages || 1;

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("...");
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
        pages.push(i);
      }
      if (currentPage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-screen bg-page">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-border-default rounded-full animate-spin border-t-blue-500 mx-auto mb-4"></div>
          <p className="text-text-secondary font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-page">
      {/* Header */}
      <header className="border-b border-border-default bg-card px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <FolderIcon className="w-8 h-8 text-blue-400" />
            <h1 className="text-2xl font-semibold text-text-primary">
              Knowledge Base
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Upload Button with Dropdown (admin only) */}
            {isAdmin && (
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
                  <div className="absolute right-0 mt-2 w-52 bg-input border border-border-default rounded-lg shadow-xl z-20 overflow-hidden">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-hover text-text-primary transition-colors text-left"
                    >
                      <DocumentArrowUpIcon className="w-5 h-5 text-blue-400" />
                      <div>
                        <p className="text-sm font-medium">Upload Files</p>
                        <p className="text-xs text-text-secondary">
                          Select one or more files
                        </p>
                      </div>
                    </button>
                    <button
                      onClick={() => folderInputRef.current?.click()}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-hover text-text-primary transition-colors text-left border-t border-border-default"
                    >
                      <FolderArrowDownIcon className="w-5 h-5 text-purple-400" />
                      <div>
                        <p className="text-sm font-medium">Upload Folder</p>
                        <p className="text-xs text-text-secondary">
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
            )}

            {/* New Folder Button (admin only) */}
            {isAdmin && (
              <button
                onClick={() => setShowNewFolder(true)}
                className="flex items-center gap-2 px-4 py-2 bg-input border border-border-default hover:bg-hover text-text-secondary rounded-lg transition-colors"
              >
                <FolderPlusIcon className="w-5 h-5" />
                <span className="font-medium">New Folder</span>
              </button>
            )}

            {/* Select Mode Toggle (admin only) */}
            {isAdmin && (
              <button
                onClick={() => selectionMode ? exitSelectionMode() : setSelectionMode(true)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium ${
                  selectionMode
                    ? "bg-blue-600 text-white"
                    : "bg-input border border-border-default hover:bg-hover text-text-secondary"
                }`}
              >
                {selectionMode ? "Cancel" : "Select"}
              </button>
            )}

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-input rounded-lg p-1">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-2 rounded ${viewMode === "grid" ? "bg-hover shadow-sm" : "hover:bg-hover"}`}
              >
                <Squares2X2Icon className="w-5 h-5 text-text-secondary" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 rounded ${viewMode === "list" ? "bg-hover shadow-sm" : "hover:bg-hover"}`}
              >
                <ListBulletIcon className="w-5 h-5 text-text-secondary" />
              </button>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text-muted" />
          <input
            type="text"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-2.5 bg-input hover:bg-hover focus:bg-input border border-border-default focus:border-blue-500 rounded-full outline-none transition-all text-text-primary placeholder:text-text-muted"
          />
        </div>
      </header>

      {/* Stats Bar */}
      <div className="px-6 py-3 bg-card/50 border-b border-border-default flex items-center gap-6 text-sm text-text-secondary flex-shrink-0">
        <div>
          <span className="font-semibold text-text-primary">
            {data?.total_documents || 0}
          </span>{" "}
          documents
        </div>
        <div>
          <span className="font-semibold text-text-primary">
            {data?.total_chunks || 0}
          </span>{" "}
          chunks
        </div>
        <div>
          <span className="font-semibold text-text-primary">
            {formatFileSize(data?.total_size || 0)}
          </span>{" "}
          storage used
        </div>
        {loading && (
          <div className="ml-auto">
            <div className="w-4 h-4 border-2 border-border-default border-t-blue-500 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Selection Bar */}
      {selectionMode && (
        <div className="px-6 py-2.5 bg-blue-600/10 border-b border-blue-500/30 flex items-center gap-4 flex-shrink-0">
          <input
            type="checkbox"
            checked={documents.length > 0 && selectedIds.size === documents.length}
            onChange={toggleSelectAll}
            className="w-4 h-4 rounded accent-blue-500 cursor-pointer"
          />
          <span className="text-sm text-text-secondary">
            {selectedIds.size > 0
              ? `${selectedIds.size} selected`
              : "Select documents"}
          </span>
          {selectedIds.size > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={handleResync}
                disabled={resyncing || bulkDeleting}
                className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors font-medium"
              >
                <ArrowPathIcon className={`w-4 h-4 ${resyncing ? "animate-spin" : ""}`} />
                {resyncing ? "Resyncing..." : `Resync ${selectedIds.size}`}
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting || resyncing}
                className="flex items-center gap-2 px-4 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors font-medium"
              >
                <TrashIcon className="w-4 h-4" />
                {bulkDeleting ? "Deleting..." : `Delete ${selectedIds.size}`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Documents Grid/List */}
        {viewMode === "grid" ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {documents.map((doc) => (
              <div
                key={doc.document_id}
                className={`group relative border rounded-xl p-4 hover:shadow-lg hover:shadow-blue-500/5 transition-all cursor-pointer bg-card ${
                  selectionMode && selectedIds.has(doc.document_id)
                    ? "border-blue-500 ring-1 ring-blue-500/50"
                    : "border-border-default hover:border-blue-500/50"
                }`}
                onClick={() =>
                  selectionMode ? toggleSelection(doc.document_id) : openPreview(doc)
                }
              >
                {/* Selection checkbox overlay */}
                {selectionMode && (
                  <div className="absolute top-2 left-2 z-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(doc.document_id)}
                      onChange={() => toggleSelection(doc.document_id)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 rounded accent-blue-500 cursor-pointer"
                    />
                  </div>
                )}
                <div className="flex flex-col items-center gap-3">
                  {getFileIcon(doc.file_type)}
                  <div className="w-full text-center">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {doc.filename}
                    </p>
                    <p className="text-xs text-text-muted mt-1">
                      {formatFileSize(doc.size)}
                    </p>
                  </div>
                  {!selectionMode && (
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openPreview(doc);
                        }}
                        className="p-2 bg-blue-600/20 hover:bg-blue-600/30 rounded-lg"
                        title="Preview"
                      >
                        <EyeIcon className="w-4 h-4 text-blue-400" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(doc);
                        }}
                        className="p-2 bg-green-600/20 hover:bg-green-600/30 rounded-lg"
                        title="Download"
                      >
                        <ArrowDownTrayIcon className="w-4 h-4 text-green-400" />
                      </button>
                      {isAdmin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(doc.document_id);
                          }}
                          className="p-2 bg-red-600/20 hover:bg-red-600/30 rounded-lg"
                          title="Delete"
                        >
                          <TrashIcon className="w-4 h-4 text-red-400" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border-default">
            <table className="w-full">
              <thead className="bg-input/50 border-b border-border-default">
                <tr>
                  {selectionMode && (
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={documents.length > 0 && selectedIds.size === documents.length}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded accent-blue-500 cursor-pointer"
                      />
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase">
                    Size
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase">
                    Chunks
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase">
                    Modified
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-text-muted uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-default">
                {documents.map((doc) => (
                  <tr
                    key={doc.document_id}
                    className={`cursor-pointer ${
                      selectionMode && selectedIds.has(doc.document_id)
                        ? "bg-blue-600/10"
                        : "hover:bg-input/50"
                    }`}
                    onClick={() =>
                      selectionMode ? toggleSelection(doc.document_id) : openPreview(doc)
                    }
                  >
                    {selectionMode && (
                      <td className="px-4 py-4 w-10">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(doc.document_id)}
                          onChange={() => toggleSelection(doc.document_id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded accent-blue-500 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0">
                          {getFileIcon(doc.file_type)}
                        </div>
                        <span className="text-sm font-medium text-text-primary">
                          {doc.filename}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-3 py-1 bg-input text-text-secondary text-xs font-medium rounded-full uppercase">
                        {doc.file_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">
                      {formatFileSize(doc.size)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">
                      {doc.chunks_count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">
                      {formatDate(doc.last_modified)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openPreview(doc);
                          }}
                          className="p-2 hover:bg-blue-600/20 rounded-lg transition-colors"
                          title="Preview"
                        >
                          <EyeIcon className="w-4 h-4 text-blue-400" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(doc);
                          }}
                          className="p-2 hover:bg-green-600/20 rounded-lg transition-colors"
                          title="Download"
                        >
                          <ArrowDownTrayIcon className="w-4 h-4 text-green-400" />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(doc.document_id);
                            }}
                            className="p-2 hover:bg-red-600/20 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <TrashIcon className="w-4 h-4 text-red-400" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {documents.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-64 text-text-muted">
            <FolderIcon className="w-20 h-20 mb-4" />
            <p className="text-lg font-medium">No documents found</p>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6 pb-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeftIcon className="w-5 h-5 text-text-secondary" />
            </button>

            {getPageNumbers().map((page, idx) =>
              page === "..." ? (
                <span key={`dots-${idx}`} className="px-2 text-text-muted">
                  ...
                </span>
              ) : (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page as number)}
                  className={`min-w-[36px] h-9 rounded-lg text-sm font-medium transition-colors ${
                    currentPage === page
                      ? "bg-blue-600 text-white"
                      : "hover:bg-hover text-text-secondary"
                  }`}
                >
                  {page}
                </button>
              ),
            )}

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRightIcon className="w-5 h-5 text-text-secondary" />
            </button>
          </div>
        )}
      </div>

      {/* File Preview Modal */}
      {showPreview && selectedDoc && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6">
          <div className="bg-card border border-border-default rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-border-default flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                {getFileIcon(selectedDoc.file_type)}
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-text-primary truncate">
                    {selectedDoc.filename}
                  </h2>
                  <p className="text-sm text-text-secondary">
                    {selectedDoc.file_type.toUpperCase()} •{" "}
                    {formatFileSize(selectedDoc.size)} •{" "}
                    {selectedDoc.chunks_count} chunks
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => handleDownload(selectedDoc)}
                  className="p-2 hover:bg-input rounded-lg transition-colors"
                  title="Download"
                >
                  <ArrowDownTrayIcon className="w-5 h-5 text-blue-400" />
                </button>
                {isAdmin && (
                  <button
                    onClick={() => handleDelete(selectedDoc.document_id)}
                    className="p-2 hover:bg-input rounded-lg transition-colors"
                    title="Delete"
                  >
                    <TrashIcon className="w-5 h-5 text-red-400" />
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

            {/* Tabs */}
            <div className="flex border-b border-border-default flex-shrink-0">
              <button
                onClick={() => setPreviewTab("preview")}
                className={`px-6 py-3 text-sm font-medium transition-colors ${
                  previewTab === "preview"
                    ? "text-blue-400 border-b-2 border-blue-400"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Preview
              </button>
              <button
                onClick={() => setPreviewTab("details")}
                className={`px-6 py-3 text-sm font-medium transition-colors ${
                  previewTab === "details"
                    ? "text-blue-400 border-b-2 border-blue-400"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Details
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto">
              {previewTab === "preview" ? (
                <div className="h-full">
                  {isPdf(selectedDoc) ? (
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
                        title={`Preview: ${selectedDoc.filename}`}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-64 text-text-muted">
                        <p>Failed to load PDF preview</p>
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
                      <p>No content available for preview</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-input rounded-lg p-4">
                      <p className="text-xs text-text-muted mb-1">Chunks</p>
                      <p className="text-2xl font-semibold text-text-primary">
                        {selectedDoc.chunks_count}
                      </p>
                    </div>
                    <div className="bg-input rounded-lg p-4">
                      <p className="text-xs text-text-muted mb-1">Language</p>
                      <p className="text-2xl font-semibold text-text-primary">
                        {selectedDoc.language || "Auto"}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-text-muted">Document ID</p>
                      <p className="text-sm font-mono text-text-primary">
                        {selectedDoc.document_id}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-muted">File Type</p>
                      <p className="text-sm text-text-primary uppercase">
                        {selectedDoc.file_type}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-muted">Size</p>
                      <p className="text-sm text-text-primary">
                        {formatFileSize(selectedDoc.size)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-muted">Created</p>
                      <p className="text-sm text-text-primary">
                        {formatDate(selectedDoc.created_at)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-muted">Modified</p>
                      <p className="text-sm text-text-primary">
                        {formatDate(selectedDoc.last_modified)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Folder Modal */}
      {showNewFolder && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6">
          <div className="bg-card border border-border-default rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-xl font-semibold text-text-primary mb-4">
              New Folder
            </h2>
            <input
              type="text"
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
              className="w-full px-4 py-3 border-2 border-border-default focus:border-blue-500 rounded-lg outline-none mb-4 bg-input text-text-primary placeholder:text-text-muted"
              autoFocus
            />
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowNewFolder(false)}
                className="flex-1 px-4 py-3 bg-input hover:bg-hover text-text-secondary rounded-lg font-medium transition-colors"
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
