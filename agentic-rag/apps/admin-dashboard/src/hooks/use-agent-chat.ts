"use client";

import { nanoid } from "nanoid";
import { useCallback, useEffect, useRef, useState } from "react";
import { AGENT_STREAM_URL, AGENT_MODELS_URL } from "@/lib/constants";

export interface Source {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
}

export interface ToolCallStatus {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  status: "running" | "completed" | "error";
  resultPreview?: string;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  sources?: Source[];
  thinkingStartedAt?: Date;
  thinkingDuration?: number;
  thinkingContent?: string;
  toolCalls?: ToolCallStatus[];
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  totalTokens: number;
  maxTokens: number;
}

export interface ModelInfo {
  model: string;
  contextWindow: number;
  maxOutputTokens: number;
  inputCostPer1M: number;
  outputCostPer1M: number;
}

interface AgentModelInfo {
  id: string;
  name: string;
  context_window: number;
  max_output: number;
  input_cost_per_1m: number;
  output_cost_per_1m: number;
  tier: string;
  capabilities: string[];
}

interface ModelsResponse {
  models: AgentModelInfo[];
  default_model: string;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface UseAgentChatOptions {
  threadId?: string;
  userId?: string;
  onError?: (error: Error) => void;
}

export interface AvailableModel {
  id: string;
  name: string;
  contextWindow: number;
  maxOutput: number;
  inputCostPer1M: number;
  outputCostPer1M: number;
  tier: "free" | "paid";
  capabilities: string[];
}

interface SSEEvent {
  event: string;
  data: Record<string, unknown> | null;
}

interface MessageData {
  type?: string;
  content?: string | Array<Record<string, unknown>>;
  tool_calls?: Array<{
    name?: string;
    output?: Array<{
      metadata?: Record<string, unknown>;
      page_content?: string;
    }>;
  }>;
}

interface AgentData {
  messages?: MessageData[];
  sources?: Array<{
    title?: string;
    url?: string;
    content?: string;
    score?: number;
  }>;
}

interface RetrievalData {
  documents?: Array<{
    metadata?: Record<string, unknown>;
    page_content?: string;
  }>;
}

interface ToolEventData {
  type: "tool_call_start" | "tool_call_end";
  tool: string;
  id: string;
  args?: Record<string, unknown>;
  status?: "ok" | "error";
  result_preview?: string;
  error?: string;
}

function extractToolEvent(data: Record<string, unknown>): ToolEventData | null {
  const eventType = data.type as string | undefined;
  if (eventType === "tool_call_start" || eventType === "tool_call_end") {
    return {
      type: eventType,
      tool: (data.tool as string) || "",
      id: (data.id as string) || "",
      args: data.args as Record<string, unknown> | undefined,
      status: data.status as "ok" | "error" | undefined,
      result_preview: data.result_preview as string | undefined,
      error: data.error as string | undefined,
    };
  }
  return null;
}

function extractAIContent(data: Record<string, unknown>): string | null {
  if (data.agent && typeof data.agent === "object") {
    const agent = data.agent as AgentData;
    if (Array.isArray(agent.messages)) {
      for (let i = agent.messages.length - 1; i >= 0; i--) {
        const msg = agent.messages[i];
        if (msg?.type === "ai") {
          if (typeof msg.content === "string") {
            return msg.content;
          }
          if (Array.isArray(msg.content)) {
            const textParts: string[] = [];
            for (const block of msg.content) {
              if (typeof block === "object" && block !== null && "type" in block) {
                const typedBlock = block as { type: string; text?: string };
                if (typedBlock.type === "text" && typedBlock.text) {
                  textParts.push(typedBlock.text);
                }
              }
            }
            if (textParts.length > 0) {
              return textParts.join("");
            }
          }
        }
      }
    }
  }
  return null;
}

interface ToolMessage {
  name?: string;
  content?: string;
  tool_call_id?: string;
}

interface ToolsData {
  messages?: ToolMessage[];
}

function parseSourceFromContent(content: string): Source[] {
  const sources: Source[] = [];
  const sourceRegex = /\[(\d+)\]\s*Source:\s*([^\n]+)\nContent:\s*([\s\S]*?)(?=\n\[\d+\]|$)/g;
  let match: RegExpExecArray | null = sourceRegex.exec(content);

  while (match !== null) {
    const title = match[2]?.trim();
    const contentSnippet = match[3]?.trim().slice(0, 200);
    if (title) {
      sources.push({
        title,
        content: contentSnippet,
      });
    }
    match = sourceRegex.exec(content);
  }

  return sources;
}

function extractSources(data: Record<string, unknown>): Source[] | null {
  if (data.tools && typeof data.tools === "object") {
    const tools = data.tools as ToolsData;
    if (Array.isArray(tools.messages)) {
      for (const msg of tools.messages) {
        if (
          (msg.name === "search_knowledge" || msg.name === "retrieve") &&
          typeof msg.content === "string"
        ) {
          const parsed = parseSourceFromContent(msg.content);
          if (parsed.length > 0) {
            return parsed;
          }
        }
      }
    }
  }

  if (data.agent && typeof data.agent === "object") {
    const agent = data.agent as AgentData;

    if (Array.isArray(agent.messages)) {
      for (const msg of agent.messages) {
        if (Array.isArray(msg?.tool_calls)) {
          for (const call of msg.tool_calls) {
            if (call.name === "retrieve" && Array.isArray(call.output)) {
              return call.output.map((doc) => ({
                title: doc.metadata?.title as string | undefined,
                url: doc.metadata?.url as string | undefined,
                content: doc.page_content,
                score: doc.metadata?.score as number | undefined,
              }));
            }
          }
        }
      }
    }

    if (Array.isArray(agent.sources)) {
      return agent.sources.map((s) => ({
        title: s.title,
        url: s.url,
        content: s.content,
        score: s.score,
      }));
    }
  }

  if (data.retrieve_memory && typeof data.retrieve_memory === "object") {
    const retrieval = data.retrieve_memory as RetrievalData;
    if (Array.isArray(retrieval.documents)) {
      return retrieval.documents.map((doc) => ({
        title: doc.metadata?.title as string | undefined,
        url: doc.metadata?.url as string | undefined,
        content: doc.page_content,
        score: doc.metadata?.score as number | undefined,
      }));
    }
  }

  return null;
}

/**
 * SSE format from LangGraph/LangServe:
 *   event: metadata | data: {"run_id": "..."}
 *   event: data     | data: {"agent": {"messages": [...]}}
 *   event: end
 */
async function* parseSSE(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<SSEEvent> {
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "message";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith(":")) continue;

        if (trimmed.startsWith("event: ")) {
          currentEvent = trimmed.slice(7);
          continue;
        }

        if (trimmed.startsWith("data: ")) {
          const dataStr = trimmed.slice(6);
          if (dataStr === "[DONE]") return;

          try {
            const data = JSON.parse(dataStr);
            yield { event: currentEvent, data };
            currentEvent = "message";
          } catch {}
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export type ChatStatus = "ready" | "submitted" | "streaming" | "error";

const DEFAULT_MAX_TOKENS = 32_768;

export function useAgentChat(options: UseAgentChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeToolCalls, setActiveToolCalls] = useState<Map<string, ToolCallStatus>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    maxTokens: DEFAULT_MAX_TOKENS,
  });
  const abortRef = useRef<AbortController | null>(null);
  const threadIdRef = useRef(options.threadId ?? nanoid());
  const userIdRef = useRef(options.userId ?? "anonymous");

  useEffect(() => {
    if (options.threadId) threadIdRef.current = options.threadId;
  }, [options.threadId]);

  useEffect(() => {
    if (options.userId) userIdRef.current = options.userId;
  }, [options.userId]);

  useEffect(() => {
    fetch(AGENT_MODELS_URL)
      .then((res) => res.json())
      .then((data: ModelsResponse) => {
        const models: AvailableModel[] = data.models.map((m) => ({
          id: m.id,
          name: m.name,
          contextWindow: m.context_window,
          maxOutput: m.max_output,
          inputCostPer1M: m.input_cost_per_1m,
          outputCostPer1M: m.output_cost_per_1m,
          tier: m.tier as "free" | "paid",
          capabilities: m.capabilities ?? ["chat"],
        }));
        setAvailableModels(models);
        setSelectedModel(data.default_model);
        
        const defaultModel = data.models.find((m) => m.id === data.default_model);
        if (defaultModel) {
          setModelInfo({
            model: defaultModel.id,
            contextWindow: defaultModel.context_window,
            maxOutputTokens: defaultModel.max_output,
            inputCostPer1M: defaultModel.input_cost_per_1m,
            outputCostPer1M: defaultModel.output_cost_per_1m,
          });
          setTokenUsage((prev) => ({
            ...prev,
            maxTokens: defaultModel.context_window,
          }));
        }
      })
      .catch((err: unknown) => {
        console.error("Failed to fetch models:", err);
      });
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      const thinkingStartedAt = new Date();

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
        thinkingStartedAt,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsLoading(true);
      setStatus("submitted");
      setError(null);

      abortRef.current = new AbortController();

      try {
        const response = await fetch(AGENT_STREAM_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Thread-ID": threadIdRef.current,
            "X-User-ID": userIdRef.current,
          },
          body: JSON.stringify({
            messages: [{ type: "human", content: content.trim() }],
            model: selectedModel,
            thread_id: threadIdRef.current,
            user_id: userIdRef.current,
          }),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        let collectedSources: Source[] = [];
        let hasReceivedContent = false;
        let accumulatedThinking = "";
        let accumulatedTokens = "";
        const toolCallsMap = new Map<string, ToolCallStatus>();

        for await (const sseEvent of parseSSE(reader)) {
          if (sseEvent.event === "thinking" && sseEvent.data) {
            const text = (sseEvent.data as { content?: string }).content ?? "";
            if (text) {
              accumulatedThinking += text;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id ? { ...m, thinkingContent: accumulatedThinking } : m
                )
              );
            }
            continue;
          }

          if (sseEvent.event === "token" && sseEvent.data) {
            const text = (sseEvent.data as { content?: string }).content ?? "";
            if (text) {
              if (!hasReceivedContent) {
                hasReceivedContent = true;
                setStatus("streaming");
              }
              accumulatedTokens += text;
              const thinkingDuration = Date.now() - thinkingStartedAt.getTime();
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? {
                        ...m,
                        content: accumulatedTokens,
                        sources: collectedSources.length > 0 ? collectedSources : undefined,
                        toolCalls:
                          toolCallsMap.size > 0 ? Array.from(toolCallsMap.values()) : undefined,
                        thinkingDuration,
                      }
                    : m
                )
              );
            }
            continue;
          }

          if (sseEvent.event === "data" && sseEvent.data) {
            const toolEvent = extractToolEvent(sseEvent.data);
            if (toolEvent) {
              if (toolEvent.type === "tool_call_start") {
                const toolCall: ToolCallStatus = {
                  id: toolEvent.id,
                  name: toolEvent.tool,
                  args: toolEvent.args,
                  status: "running",
                  startedAt: new Date(),
                };
                toolCallsMap.set(toolEvent.id, toolCall);
                setActiveToolCalls(new Map(toolCallsMap));

                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, toolCalls: Array.from(toolCallsMap.values()) }
                      : m
                  )
                );
              } else if (toolEvent.type === "tool_call_end") {
                const existing = toolCallsMap.get(toolEvent.id);
                if (existing) {
                  existing.status = toolEvent.status === "error" ? "error" : "completed";
                  existing.resultPreview = toolEvent.result_preview;
                  existing.error = toolEvent.error;
                  existing.completedAt = new Date();
                  toolCallsMap.set(toolEvent.id, existing);
                  setActiveToolCalls(new Map(toolCallsMap));

                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsg.id
                        ? { ...m, toolCalls: Array.from(toolCallsMap.values()) }
                        : m
                    )
                  );
                }
              }
              continue;
            }

            const sources = extractSources(sseEvent.data);
            if (sources && sources.length > 0) {
              collectedSources = [...collectedSources, ...sources];
            }

            const aiContent = extractAIContent(sseEvent.data);
            if (aiContent) {
              if (!hasReceivedContent) {
                hasReceivedContent = true;
                setStatus("streaming");
              }

              const thinkingDuration = Date.now() - thinkingStartedAt.getTime();

              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? {
                        ...m,
                        content: aiContent,
                        sources: collectedSources.length > 0 ? collectedSources : undefined,
                        toolCalls:
                          toolCallsMap.size > 0 ? Array.from(toolCallsMap.values()) : undefined,
                        thinkingDuration,
                      }
                    : m
                )
              );
            }
          }

          if (sseEvent.event === "end") {
            break;
          }
        }

        const finalThinkingDuration = Date.now() - thinkingStartedAt.getTime();
        setActiveToolCalls(new Map());

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? {
                  ...m,
                  isStreaming: false,
                  thinkingDuration: finalThinkingDuration,
                  sources: collectedSources.length > 0 ? collectedSources : undefined,
                  toolCalls: toolCallsMap.size > 0 ? Array.from(toolCallsMap.values()) : undefined,
                }
              : m
          )
        );
        setStatus("ready");
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, isStreaming: false, content: m.content || "(cancelled)" }
                : m
            )
          );
          setStatus("ready");
        } else {
          const chatError = err instanceof Error ? err : new Error("Unknown error");
          setError(chatError);
          setStatus("error");
          options.onError?.(chatError);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? {
                    ...m,
                    isStreaming: false,
                    content: `Error: ${chatError.message}`,
                  }
                : m
            )
          );
        }
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [isLoading, options, selectedModel]
  );

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    setStatus("ready");
    setTokenUsage((prev) => ({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      maxTokens: prev.maxTokens,
    }));
    threadIdRef.current = nanoid();
  }, []);

  const regenerate = useCallback(() => {
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMessage || isLoading) return;

    const lastUserIndex = messages.findIndex((m) => m.id === lastUserMessage.id);
    setMessages((prev) => prev.slice(0, lastUserIndex));

    setTimeout(() => {
      sendMessage(lastUserMessage.content);
    }, 0);
  }, [messages, isLoading, sendMessage]);

  const editMessage = useCallback(
    (messageId: string, newContent: string) => {
      if (!newContent.trim() || isLoading) return;

      const messageIndex = messages.findIndex((m) => m.id === messageId);
      if (messageIndex === -1) return;

      const targetMessage = messages[messageIndex];
      if (targetMessage?.role !== "user") return;

      setMessages((prev) => prev.slice(0, messageIndex));

      setTimeout(() => {
        sendMessage(newContent.trim());
      }, 0);
    },
    [messages, isLoading, sendMessage]
  );

  const selectModel = useCallback(
    (modelId: string) => {
      const model = availableModels.find((m) => m.id === modelId);
      if (!model) return;
      
      setSelectedModel(modelId);
      setModelInfo({
        model: model.id,
        contextWindow: model.contextWindow,
        maxOutputTokens: model.maxOutput,
        inputCostPer1M: model.inputCostPer1M,
        outputCostPer1M: model.outputCostPer1M,
      });
      setTokenUsage((prev) => ({
        ...prev,
        maxTokens: model.contextWindow,
      }));
    },
    [availableModels]
  );

  useEffect(() => {
    let inputTokens = 0;
    let outputTokens = 0;
    for (const msg of messages) {
      const tokens = estimateTokens(msg.content);
      if (msg.role === "user") {
        inputTokens += tokens;
      } else {
        outputTokens += tokens;
      }
    }
    setTokenUsage((prev) => ({
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      maxTokens: prev.maxTokens,
    }));
  }, [messages]);

  return {
    messages,
    activeToolCalls: Array.from(activeToolCalls.values()),
    isLoading,
    error,
    status,
    tokenUsage,
    modelInfo,
    availableModels,
    selectedModel,
    selectModel,
    sendMessage,
    stopGeneration,
    clearMessages,
    regenerate,
    editMessage,
    threadId: threadIdRef.current,
  };
}
