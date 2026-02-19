/**
 * WebSocket hook for connecting to the RAG backend
 */

import { useEffect, useCallback, useRef } from "react";
import { useAppStore } from "../store/appStore";
import { WS_BASE_URL } from "../config/api";
import type { ChatEvent, WSRequest } from "../types/api";
import type { Message } from "../types/message";

const WS_URL = import.meta.env.VITE_WS_URL || `${WS_BASE_URL}/ws/chat`;
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 30000;

export const useWebSocket = () => {
  const {
    ws,
    setWs,
    setWsStatus,
    addMessage,
    setCurrentThreadId,
    setIsStreaming,
    setCurrentNode,
    setCurrentMetadata,
    addError,
    addWarning,
    clearWarnings,
  } = useAppStore();

  const retriesRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    // Clear any existing reconnect timeout
    if (reconnectTimeoutRef.current) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setWsStatus("connecting");

    try {
      const socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        console.log("WebSocket connected");
        setWsStatus("connected");
        setWs(socket);
        retriesRef.current = 0; // Reset retry counter on successful connection
      };

      socket.onmessage = (event) => {
        try {
          const chatEvent: ChatEvent = JSON.parse(event.data);
          handleChatEvent(chatEvent);
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
          addError("Failed to parse server message");
        }
      };

      socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        setWsStatus("error");
      };

      socket.onclose = () => {
        console.log("WebSocket disconnected");
        setWsStatus("disconnected");
        setWs(null);

        // Attempt to reconnect with exponential backoff
        if (retriesRef.current < MAX_RETRIES) {
          const delay = Math.min(
            INITIAL_RETRY_DELAY * Math.pow(2, retriesRef.current),
            MAX_RETRY_DELAY,
          );
          console.log(
            `Reconnecting in ${delay}ms... (attempt ${retriesRef.current + 1}/${MAX_RETRIES})`,
          );

          reconnectTimeoutRef.current = window.setTimeout(() => {
            retriesRef.current++;
            connect();
          }, delay);
        } else {
          addError("Connection lost. Please refresh the page.");
        }
      };
    } catch (error) {
      console.error("Failed to create WebSocket:", error);
      setWsStatus("error");
      addError("Failed to connect to server");
    }
  }, [setWs, setWsStatus, addError]);

  const handleChatEvent = useCallback(
    (event: ChatEvent) => {
      switch (event.event) {
        case "warning":
          if (event.data?.message) {
            addWarning(event.data.message);
          }
          if (event.data?.warnings && Array.isArray(event.data.warnings)) {
            event.data.warnings.forEach((w) => addWarning(w));
          }
          break;

        case "error":
          setIsStreaming(false);
          setCurrentNode(null);
          if (event.data?.message) {
            addError(event.data.message);
            // Add error message to chat
            const errorMessage: Message = {
              id: crypto.randomUUID(),
              role: "assistant",
              content: `Error: ${event.data.message}`,
              timestamp: new Date(),
              error: event.data.message,
            };
            addMessage(errorMessage);
          }
          break;

        case "node_start":
          if (event.node) {
            setCurrentNode(event.node);
            setIsStreaming(true);
          }
          break;

        case "node_end":
          if (event.node) {
            console.log(`Node ${event.node} completed`);
          }
          break;

        case "generation":
          setIsStreaming(false);
          setCurrentNode(null);
          clearWarnings();

          if (event.data?.answer) {
            const assistantMessage: Message = {
              id: crypto.randomUUID(),
              role: "assistant",
              content: event.data.answer,
              timestamp: new Date(),
              sources: event.data.sources,
              metadata: event.data.context_metadata,
            };
            addMessage(assistantMessage);

            // Update thread ID for multi-turn conversations
            if (event.data.thread_id) {
              setCurrentThreadId(event.data.thread_id);
            }

            // Update metadata display
            if (event.data.context_metadata) {
              setCurrentMetadata(event.data.context_metadata);
            }
          }
          break;

        default:
          console.warn("Unknown event type:", event.event);
      }
    },
    [
      addWarning,
      addError,
      addMessage,
      setIsStreaming,
      setCurrentNode,
      setCurrentThreadId,
      setCurrentMetadata,
      clearWarnings,
    ],
  );

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (ws) {
      ws.close();
      setWs(null);
    }
    setWsStatus("disconnected");
    retriesRef.current = MAX_RETRIES; // Prevent auto-reconnect
  }, [ws, setWs, setWsStatus]);

  const sendMessage = useCallback(
    (query: string, context?: WSRequest["context"]) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        addError("Not connected to server");
        return;
      }

      const { currentThreadId, getRuntimeContext } = useAppStore.getState();

      const message: WSRequest = {
        query,
        thread_id: currentThreadId,
        context: context || getRuntimeContext(),
      };

      try {
        ws.send(JSON.stringify(message));

        // Add user message to chat
        const userMessage: Message = {
          id: crypto.randomUUID(),
          role: "user",
          content: query,
          timestamp: new Date(),
        };
        addMessage(userMessage);

        setIsStreaming(true);
      } catch (error) {
        console.error("Failed to send message:", error);
        addError("Failed to send message");
        setIsStreaming(false);
      }
    },
    [ws, addMessage, setIsStreaming, addError],
  );

  // Connect on mount
  useEffect(() => {
    connect();

    // Cleanup on unmount
    return () => {
      disconnect();
    };
  }, []);

  return {
    sendMessage,
    disconnect,
    reconnect: connect,
  };
};
