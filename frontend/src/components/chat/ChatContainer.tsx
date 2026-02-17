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
    <div className="flex flex-col h-screen bg-slate-950">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Chat Assistant</h1>
          <p className="text-sm text-slate-400">
            AI-powered knowledge assistant with RAG
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg transition-colors border border-blue-500/30"
            title="Upload document"
          >
            <ArrowUpTrayIcon className="w-5 h-5" />
            <span className="font-medium">Upload</span>
          </button>

          <button
            onClick={clearChat}
            className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors border border-red-500/30"
            title="Clear chat"
          >
            <TrashIcon className="w-5 h-5" />
            <span className="font-medium">Clear</span>
          </button>

          <button
            onClick={onOpenSettings}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700"
            title="Settings"
          >
            <Cog6ToothIcon className="w-5 h-5" />
            <span className="font-medium">Settings</span>
          </button>

          {isStreaming && (
            <div className="flex items-center gap-2 px-4 py-2 bg-green-600/20 rounded-lg border border-green-500/30">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-green-400">
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="relative max-w-lg w-full mx-4">
            <button
              onClick={() => setShowUpload(false)}
              className="absolute -top-10 right-0 text-slate-400 hover:text-slate-200"
            >
              Close
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
