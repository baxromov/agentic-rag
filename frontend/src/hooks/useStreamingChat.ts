import { useState, useCallback, useRef } from "react";
import { API_BASE_URL } from "../config/api";
import { apiFetch } from "../config/apiClient";
import { useSessionStore } from "../store/sessionStore";
import type { SourceDocument } from "../types/api";
import type { MessageFeedback } from "../types/session";

export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: SourceDocument[];
  messageIndex?: number;
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
  const [clarificationQuestion, setClarificationQuestion] = useState<
    string | null
  >(null);
  const [awaitingClarification, setAwaitingClarification] = useState(false);
  const [feedbacks, setFeedbacks] = useState<Record<number, MessageFeedback>>(
    {},
  );
  const abortControllerRef = useRef<AbortController | null>(null);
  const accumulatedResponseRef = useRef("");

  const sessionStore = useSessionStore;

  const _processSSE = useCallback(
    async (response: Response) => {
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
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6);
            if (jsonStr.trim()) {
              try {
                const event: StreamEvent = JSON.parse(jsonStr);

                if (event.event === "session_created") {
                  const sid = event.data?.session_id || event.data?.thread_id;
                  if (sid) {
                    // Add the new session to the list and select it
                    sessionStore.getState().addOrUpdateSession({
                      thread_id: sid,
                      title: "New Chat",
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                      message_count: 0,
                    });
                    sessionStore.getState().selectSession(sid);
                  }
                }

                if (event.event === "session_title") {
                  const sid = event.data?.session_id;
                  const title = event.data?.title;
                  if (sid && title) {
                    sessionStore.getState().updateSessionTitle(sid, title);
                  }
                }

                if (event.event === "llm_token") {
                  if (event.data?.token) {
                    accumulatedResponseRef.current += event.data.token;
                    setCurrentResponse(accumulatedResponseRef.current);
                  }
                }

                if (event.event === "clarification_needed") {
                  setClarificationQuestion(event.data?.question || null);
                  setAwaitingClarification(true);
                }

                if (event.event === "generation") {
                  accumulatedResponseRef.current = "";
                  setMessages((prev) => {
                    const assistantMessage: Message = {
                      role: "assistant",
                      content: event.data.answer || "",
                      timestamp: new Date(),
                      sources: event.data.sources || [],
                      messageIndex: prev.length,
                    };
                    return [...prev, assistantMessage];
                  });
                  setCurrentResponse("");

                  // Update session store
                  const sid =
                    event.data.session_id || event.data.thread_id;
                  if (sid) {
                    sessionStore.getState().selectSession(sid);
                    sessionStore.getState().incrementMessageCount(sid);
                  }
                }

                if (event.event === "error") {
                  console.error("Stream error:", event.data?.message);
                  const partial = accumulatedResponseRef.current;
                  accumulatedResponseRef.current = "";
                  setMessages((prev) => {
                    const next = partial
                      ? [...prev, { role: "assistant" as const, content: partial, timestamp: new Date() }]
                      : prev;
                    return [...next, { role: "assistant" as const, content: `Error: ${event.data?.message || "Unknown error"}`, timestamp: new Date() }];
                  });
                  setCurrentResponse("");
                }
              } catch (e) {
                console.error("Failed to parse event:", jsonStr, e);
              }
            }
          }
        }
      }
    },
    [sessionStore],
  );

  const loadMessages = useCallback(
    async (sessionId: string) => {
      try {
        const res = await apiFetch(
          `${API_BASE_URL}/sessions/${sessionId}/messages`,
        );
        if (res.ok) {
          const data = await res.json();
          const loaded: Message[] = data.map(
            (
              m: { role: string; content: string; sources?: SourceDocument[] },
              idx: number,
            ) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
              timestamp: new Date(),
              sources: m.sources || [],
              messageIndex: idx,
            }),
          );
          setMessages(loaded);
        } else if (res.status === 404) {
          // Session no longer exists (e.g. after service restart) — clear stale reference
          console.warn("Session not found, clearing stale session:", sessionId);
          sessionStore.getState().selectSession(null);
          setMessages([]);
          // Remove from sessions list
          sessionStore.setState((s) => ({
            sessions: s.sessions.filter((x) => x.thread_id !== sessionId),
          }));
          return;
        }
      } catch (e) {
        console.error("Failed to load messages:", e);
      }

      // Load feedback
      try {
        const res = await apiFetch(
          `${API_BASE_URL}/feedback/${sessionId}`,
        );
        if (res.ok) {
          const data: MessageFeedback[] = await res.json();
          const map: Record<number, MessageFeedback> = {};
          for (const fb of data) {
            map[fb.message_index] = fb;
          }
          setFeedbacks(map);
        }
      } catch {
        // ignore
      }
    },
    [],
  );

  const sendMessage = useCallback(
    async (query: string) => {
      if (!query.trim() || isStreaming) return;

      const userMessage: Message = {
        role: "user",
        content: query,
        timestamp: new Date(),
      };
      setMessages((prev) => {
        const updated = [...prev, userMessage];
        // Set messageIndex
        userMessage.messageIndex = updated.length - 1;
        return updated;
      });
      setIsStreaming(true);
      setCurrentResponse("");
      setClarificationQuestion(null);
      setAwaitingClarification(false);

      abortControllerRef.current = new AbortController();

      try {
        const activeSessionId = sessionStore.getState().activeSessionId;

        const response = await apiFetch(`${API_BASE_URL}/chat/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            session_id: activeSessionId,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        await _processSSE(response);
      } catch (error: any) {
        const partial = accumulatedResponseRef.current;
        if (error.name === "AbortError") {
          if (partial) {
            setMessages((prev) => [...prev, { role: "assistant", content: partial, timestamp: new Date() }]);
          }
        } else {
          console.error("Stream error:", error);
          setMessages((prev) => {
            const next = partial
              ? [...prev, { role: "assistant" as const, content: partial, timestamp: new Date() }]
              : prev;
            return [...next, { role: "assistant" as const, content: `Error: ${error.message}`, timestamp: new Date() }];
          });
        }
      } finally {
        accumulatedResponseRef.current = "";
        setIsStreaming(false);
        setCurrentResponse("");
        abortControllerRef.current = null;
        // Refresh sessions list so sidebar reflects new session/title/message count
        sessionStore.getState().fetchSessions();
      }
    },
    [isStreaming, _processSSE, sessionStore],
  );

  const resumeAfterClarification = useCallback(
    async (response: string) => {
      const activeSessionId = sessionStore.getState().activeSessionId;
      if (!activeSessionId) return;

      // Add user's clarification as a message
      const userMsg: Message = {
        role: "user",
        content: response,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);
      setCurrentResponse("");
      setClarificationQuestion(null);
      setAwaitingClarification(false);

      abortControllerRef.current = new AbortController();

      try {
        const res = await apiFetch(`${API_BASE_URL}/chat/resume`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: activeSessionId,
            response,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }

        await _processSSE(res);
      } catch (error: any) {
        const partial = accumulatedResponseRef.current;
        if (error.name !== "AbortError") {
          console.error("Resume error:", error);
          setMessages((prev) => {
            const next = partial
              ? [...prev, { role: "assistant" as const, content: partial, timestamp: new Date() }]
              : prev;
            return [...next, { role: "assistant" as const, content: `Error: ${error.message}`, timestamp: new Date() }];
          });
        } else if (partial) {
          setMessages((prev) => [...prev, { role: "assistant", content: partial, timestamp: new Date() }]);
        }
      } finally {
        accumulatedResponseRef.current = "";
        setIsStreaming(false);
        setCurrentResponse("");
        abortControllerRef.current = null;
        sessionStore.getState().fetchSessions();
      }
    },
    [_processSSE, sessionStore],
  );

  const submitFeedback = useCallback(
    async (messageIndex: number, rating: "up" | "down", note?: string) => {
      const activeSessionId = sessionStore.getState().activeSessionId;
      if (!activeSessionId) return;

      try {
        const res = await apiFetch(`${API_BASE_URL}/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            thread_id: activeSessionId,
            message_index: messageIndex,
            rating,
            note: note || null,
          }),
        });
        if (res.ok) {
          setFeedbacks((prev) => ({
            ...prev,
            [messageIndex]: {
              thread_id: activeSessionId,
              message_index: messageIndex,
              rating,
              note: note || null,
            },
          }));
        }
      } catch (e) {
        console.error("Failed to submit feedback:", e);
      }
    },
    [sessionStore],
  );

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const newChat = useCallback(() => {
    setMessages([]);
    setCurrentResponse("");
    setClarificationQuestion(null);
    setAwaitingClarification(false);
    setFeedbacks({});
    sessionStore.getState().selectSession(null);
  }, [sessionStore]);

  return {
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
  };
};
