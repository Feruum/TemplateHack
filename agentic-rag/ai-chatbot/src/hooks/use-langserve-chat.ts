"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { nanoid } from "nanoid";
import { AGENT_STREAM_PATH } from "@/lib/constants";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  sources?: Source[];
  toolCalls?: ToolCall[];
}

export interface Source {
  title?: string;
  url?: string;
  content?: string;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result?: string;
}

interface SSEEvent {
  event: string;
  data: Record<string, unknown> | null;
}

/**
 * Extract AI message content from LangGraph event data.
 * The data structure is: { agent: { messages: [...] } } or { fetch_memory: {...} } etc.
 */
function extractAIContent(data: Record<string, unknown>): string | null {
  // Handle agent output with messages
  if (data.agent && typeof data.agent === "object") {
    const agent = data.agent as Record<string, unknown>;
    if (Array.isArray(agent.messages)) {
      // Find the last AI message
      for (let i = agent.messages.length - 1; i >= 0; i--) {
        const msg = agent.messages[i] as Record<string, unknown>;
        if (msg.type === "ai" && typeof msg.content === "string") {
          return msg.content;
        }
      }
    }
  }
  return null;
}

/**
 * Parse SSE stream from LangGraph/LangServe.
 * Format:
 *   event: metadata
 *   data: {"run_id": "..."}
 *
 *   event: data
 *   data: {"agent": {"messages": [...]}}
 *
 *   event: end
 */
async function* parseSSE(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<SSEEvent> {
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "message"; // Default SSE event type

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        
        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith(":")) continue;

        // Parse event type
        if (trimmed.startsWith("event: ")) {
          currentEvent = trimmed.slice(7);
          continue;
        }

        // Parse data
        if (trimmed.startsWith("data: ")) {
          const dataStr = trimmed.slice(6);
          if (dataStr === "[DONE]") return;

          try {
            const data = JSON.parse(dataStr);
            yield { event: currentEvent, data };
            currentEvent = "message"; // Reset to default
          } catch {
            // Non-JSON data, skip
            continue;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

interface UseLangServeChatOptions {
  threadId?: string;
  userId?: string;
  onError?: (error: Error) => void;
}

export function useLangServeChat(options: UseLangServeChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const threadIdRef = useRef(options.threadId ?? nanoid());
  const userIdRef = useRef(options.userId ?? "anonymous");

  useEffect(() => {
    if (options.threadId) threadIdRef.current = options.threadId;
  }, [options.threadId]);

  useEffect(() => {
    if (options.userId) userIdRef.current = options.userId;
  }, [options.userId]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      const userMsg: ChatMessage = {
        id: nanoid(),
        role: "user",
        content: content.trim(),
        timestamp: new Date(),
      };

      const assistantMsg: ChatMessage = {
        id: nanoid(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsLoading(true);
      setError(null);

      abortRef.current = new AbortController();

      try {
        const response = await fetch(AGENT_STREAM_PATH, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Thread-ID": threadIdRef.current,
            "X-User-ID": userIdRef.current,
          },
          body: JSON.stringify({
            input: {
              messages: [{ type: "human", content: content.trim() }],
            },
            config: {
              configurable: {
                thread_id: threadIdRef.current,
                user_id: userIdRef.current,
              },
            },
          }),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        for await (const sseEvent of parseSSE(reader)) {
          // Handle data events with agent messages
          if (sseEvent.event === "data" && sseEvent.data) {
            const aiContent = extractAIContent(sseEvent.data);
            if (aiContent) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, content: aiContent }
                    : m
                )
              );
            }
          }

          // Handle end event
          if (sseEvent.event === "end") {
            break;
          }
        }

        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsg.id ? { ...m, isStreaming: false } : m))
        );
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, isStreaming: false, content: m.content || "(cancelled)" }
                : m
            )
          );
        } else {
          const chatError = err instanceof Error ? err : new Error("Unknown error");
          setError(chatError);
          options.onError?.(chatError);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, isStreaming: false, content: `Error: ${chatError.message}` }
                : m
            )
          );
        }
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [isLoading, options]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
    setError(null);
    threadIdRef.current = nanoid();
  }, []);

  const setUserId = useCallback((id: string) => {
    userIdRef.current = id;
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    stop,
    clear,
    setUserId,
    threadId: threadIdRef.current,
  };
}
