/**
 * Main chat container component with streaming support
 */

import { useState } from "react";
import { useStreamingChat } from "../../hooks/useStreamingChat";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { FileUpload } from "../common/FileUpload";
import {
  Cog6ToothIcon,
  ArrowUpTrayIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

interface ChatContainerProps {
  onOpenSettings: () => void;
}

export const ChatContainer: React.FC<ChatContainerProps> = ({
  onOpenSettings,
}) => {
  const {
    messages,
    isStreaming,
    currentResponse,
    sendMessage,
    stopStreaming,
    clearChat,
  } = useStreamingChat();
  const [showUpload, setShowUpload] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Chat Assistant</h1>
          <p className="text-sm text-slate-600">
            AI-powered knowledge assistant with RAG
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Upload Button */}
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors"
            title="Upload document"
          >
            <ArrowUpTrayIcon className="w-5 h-5" />
            <span className="font-medium">Upload</span>
          </button>

          {/* Clear Chat */}
          <button
            onClick={clearChat}
            className="flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
            title="Clear chat"
          >
            <TrashIcon className="w-5 h-5" />
            <span className="font-medium">Clear</span>
          </button>

          {/* Settings */}
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
            title="Settings"
          >
            <Cog6ToothIcon className="w-5 h-5" />
            <span className="font-medium">Settings</span>
          </button>

          {/* Streaming Status */}
          {isStreaming && (
            <div className="flex items-center gap-2 px-4 py-2 bg-green-50 rounded-lg">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-green-700">
                Streaming...
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Messages */}
      <MessageList
        messages={messages}
        isStreaming={isStreaming}
        currentResponse={currentResponse}
      />

      {/* Input */}
      <MessageInput
        onSendMessage={sendMessage}
        disabled={isStreaming}
        onStop={stopStreaming}
      />

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="relative max-w-lg w-full mx-4">
            <button
              onClick={() => setShowUpload(false)}
              className="absolute -top-10 right-0 text-white hover:text-slate-300"
            >
              Close ✕
            </button>
            <FileUpload
              onUploadSuccess={(result) => {
                console.log("Upload successful:", result);
                setTimeout(() => setShowUpload(false), 2000);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
