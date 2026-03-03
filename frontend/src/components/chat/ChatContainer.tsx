/**
 * Main chat container component with streaming, sessions, feedback, and HITL support
 */

import { useState, useEffect, useRef } from "react";
import { useStreamingChat } from "../../hooks/useStreamingChat";
import { useSessionStore } from "../../store/sessionStore";
import { useAuthStore } from "../../store/authStore";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { SessionList } from "./SessionList";
import { FileUpload } from "../common/FileUpload";
import {
  ArrowUpTrayIcon,
  PlusIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";

export const ChatContainer: React.FC = () => {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";
  const {
    messages,
    isStreaming,
    currentResponse,
    clarificationQuestion,
    awaitingClarification,
    feedbacks,
    sendMessage,
    stopStreaming,
    newChat,
    loadMessages,
    resumeAfterClarification,
    submitFeedback,
  } = useStreamingChat();

  const { activeSessionId, sessions, fetchSessions, selectSession, deleteSession } = useSessionStore();
  const [showUpload, setShowUpload] = useState(false);
  const isStreamingRef = useRef(false);

  // Fetch sessions on mount
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Keep streaming ref in sync so the session-change effect can read it
  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // Load messages when active session changes, or clear on new chat
  // Skip loading while streaming — the SSE session_created event changes
  // activeSessionId mid-stream, and calling loadMessages would overwrite
  // the optimistic user message with stale server data.
  useEffect(() => {
    if (activeSessionId) {
      if (!isStreamingRef.current) {
        loadMessages(activeSessionId);
      }
    } else {
      newChat();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  const handleSkipClarification = () => {
    // Send a generic "skip" to continue with whatever the agent has
    resumeAfterClarification("Please continue with the best available information.");
  };

  const handleSelectSession = (id: string) => {
    selectSession(id);
  };

  const handleNewChat = () => {
    selectSession(null);
    newChat();
  };

  return (
    <div className="flex h-screen bg-page">
      {/* Session History Panel */}
      <aside className="w-72 flex-shrink-0 bg-card border-r border-border-default flex flex-col h-full">
        <div className="p-4 border-b border-border-default">
          <div className="flex items-center gap-2 mb-3">
            <ClockIcon className="w-5 h-5 text-text-secondary" />
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
              Chat History
            </h2>
          </div>
          <button
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl transition-all text-sm font-medium shadow-lg shadow-blue-500/20"
          >
            <PlusIcon className="w-4 h-4" />
            New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-1 py-2 scrollbar-thin scrollbar-thumb-border-default">
          <SessionList
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelect={handleSelectSession}
            onDelete={deleteSession}
          />
        </div>
      </aside>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 bg-card border-b border-border-default flex-shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">HR Assistant</h1>
            <p className="text-sm text-text-secondary">
              Ask questions about company policies and internal regulations
            </p>
          </div>

          <div className="flex items-center gap-3">
            {isAdmin && (
              <button
                onClick={() => setShowUpload(!showUpload)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg transition-colors border border-blue-500/30"
                title="Upload document"
              >
                <ArrowUpTrayIcon className="w-5 h-5" />
                <span className="font-medium">Upload</span>
              </button>
            )}

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
          onSuggestionClick={sendMessage}
          feedbacks={feedbacks}
          onSubmitFeedback={submitFeedback}
          clarificationQuestion={clarificationQuestion}
          awaitingClarification={awaitingClarification}
          onRespondClarification={resumeAfterClarification}
          onSkipClarification={handleSkipClarification}
        />

        {/* Input */}
        <MessageInput
          onSendMessage={sendMessage}
          disabled={isStreaming}
          onStop={stopStreaming}
        />
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="relative max-w-lg w-full mx-4">
            <button
              onClick={() => setShowUpload(false)}
              className="absolute -top-10 right-0 text-text-secondary hover:text-text-primary"
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
