/**
 * Scrollable message list with auto-scroll and streaming support
 */

import { useEffect, useRef } from "react";
import { Message } from "./Message";
import { StreamingIndicator } from "./StreamingIndicator";

interface MessageType {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface MessageListProps {
  messages: MessageType[];
  isStreaming: boolean;
  currentResponse: string;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isStreaming,
  currentResponse,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentResponse]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
      {messages.length === 0 && !isStreaming ? (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl flex items-center justify-center mb-6 shadow-xl">
            <svg
              className="w-10 h-10 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-slate-100 mb-3">
            Welcome to RAG Assistant
          </h2>
          <p className="text-slate-400 max-w-md text-lg">
            Ask me anything! I use hybrid search with retrieval, reranking, and
            intelligent grading to find the most relevant information from your
            knowledge base.
          </p>
          <div className="mt-6 flex gap-3">
            <div className="px-4 py-2 bg-blue-600/20 border border-blue-500/30 rounded-lg text-sm text-blue-400">
              Multilingual Support
            </div>
            <div className="px-4 py-2 bg-green-600/20 border border-green-500/30 rounded-lg text-sm text-green-400">
              Smart Search
            </div>
            <div className="px-4 py-2 bg-purple-600/20 border border-purple-500/30 rounded-lg text-sm text-purple-400">
              Real-time Streaming
            </div>
          </div>
        </div>
      ) : (
        <>
          {messages.map((message, idx) => (
            <Message key={idx} message={message} />
          ))}

          {isStreaming && currentResponse && (
            <div className="flex gap-3">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center shadow-md">
                  <svg
                    className="w-5 h-5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                </div>
              </div>
              <div className="flex-1">
                <div className="bg-slate-800 border border-slate-700 rounded-2xl px-5 py-4 shadow-sm">
                  <div className="prose prose-invert max-w-none">
                    <p className="text-slate-200 whitespace-pre-wrap">
                      {currentResponse}
                    </p>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                    <span className="text-xs text-slate-500">
                      Generating response...
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {isStreaming && !currentResponse && <StreamingIndicator />}
        </>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};
