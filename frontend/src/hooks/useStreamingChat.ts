import { useState, useCallback, useRef } from "react";
import { API_BASE_URL } from "../config/api";
import type { SourceDocument } from "../types/api";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: SourceDocument[];
}

interface StreamEvent {
  event: string;
  node?: string;
  data?: any;
}

export const useStreamingChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentResponse, setCurrentResponse] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (query: string) => {
      if (!query.trim() || isStreaming) return;

      // Add user message
      const userMessage: Message = {
        role: "user",
        content: query,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsStreaming(true);
      setCurrentResponse("");

      // Create abort controller for this request
      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch(`${API_BASE_URL}/chat/stream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query,
            thread_id: threadId,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error("No response body");
        }

        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");

          // Keep the last incomplete line in the buffer
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const jsonStr = line.slice(6); // Remove 'data: ' prefix
              if (jsonStr.trim()) {
                try {
                  const event: StreamEvent = JSON.parse(jsonStr);

                  if (event.event === "thread_created") {
                    setThreadId(event.data?.thread_id);
                  }

                  if (event.event === "node_end" && event.node === "generate") {
                    if (event.data?.generation) {
                      setCurrentResponse(event.data.generation);
                    }
                  }

                  if (event.event === "generation") {
                    // Final response
                    const assistantMessage: Message = {
                      role: "assistant",
                      content: event.data.answer || "",
                      timestamp: new Date(),
                      sources: event.data.sources || [],
                    };
                    setMessages((prev) => [...prev, assistantMessage]);
                    setCurrentResponse("");
                    setThreadId(event.data.thread_id);
                  }

                  if (event.event === "error") {
                    console.error("Stream error:", event.data?.message);
                    const errorMessage: Message = {
                      role: "assistant",
                      content: `Error: ${event.data?.message || "Unknown error"}`,
                      timestamp: new Date(),
                    };
                    setMessages((prev) => [...prev, errorMessage]);
                    setCurrentResponse("");
                  }
                } catch (e) {
                  console.error("Failed to parse event:", jsonStr, e);
                }
              }
            }
          }
        }
      } catch (error: any) {
        if (error.name === "AbortError") {
          console.log("Stream aborted");
        } else {
          console.error("Stream error:", error);
          const errorMessage: Message = {
            role: "assistant",
            content: `Error: ${error.message}`,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, errorMessage]);
        }
      } finally {
        setIsStreaming(false);
        setCurrentResponse("");
        abortControllerRef.current = null;
      }
    },
    [isStreaming, threadId],
  );

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setThreadId(null);
    setCurrentResponse("");
  }, []);

  return {
    messages,
    isStreaming,
    currentResponse,
    sendMessage,
    stopStreaming,
    clearChat,
  };
};
