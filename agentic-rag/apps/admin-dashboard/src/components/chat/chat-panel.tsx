"use client";

import { AnimatePresence, motion } from "motion/react";

import {
  Conversation,
  ConversationContent,
  ConversationDownload,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { useAgentChat } from "@/hooks/use-agent-chat";

import { ChatEmptyState } from "./chat-empty-state";
import { ChatInput } from "./chat-input";
import { ChatMessageItem } from "./chat-message-item";

export function ChatPanel() {
  const {
    messages,
    status,
    tokenUsage,
    modelInfo,
    availableModels,
    selectedModel,
    selectModel,
    isLoading,
    sendMessage,
    stopGeneration,
    clearMessages,
    regenerate,
    editMessage,
    error,
  } = useAgentChat();

  const handleSubmit = async ({ text }: { text: string; files: unknown[] }) => {
    if (!text.trim()) return;
    await sendMessage(text);
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(suggestion);
  };

  const lastAssistantIndex = [...messages].reverse().findIndex((m) => m.role === "assistant");
  const lastAssistantId =
    lastAssistantIndex !== -1 ? messages[messages.length - 1 - lastAssistantIndex]?.id : null;

  const isReasoningModel =
    availableModels.find((m) => m.id === selectedModel)?.capabilities.includes("reasoning") ??
    false;

  const hasMessages = messages.length > 0;

  if (!hasMessages) {
    return (
      <div className="flex flex-col h-full w-full bg-background">
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <ChatEmptyState onSelectSuggestion={handleSuggestionClick} />

          <div className="w-full max-w-xl mt-6">
            <ChatInput
              status={status}
              onSubmit={handleSubmit}
              onStop={stopGeneration}
              availableModels={availableModels}
              selectedModel={selectedModel}
              onSelectModel={selectModel}
              tokenUsage={tokenUsage}
              modelInfo={modelInfo ?? undefined}
              isLoading={isLoading}
              hasMessages={false}
              error={error ? error.message : null}
              onRegenerate={regenerate}
              isReasoningModel={isReasoningModel}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-background">
      <Conversation className="flex-1">
        <ConversationContent className="max-w-3xl mx-auto w-full px-4 md:px-6 gap-4">
          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <ChatMessageItem
                  message={message}
                  onEdit={editMessage}
                  onRegenerate={regenerate}
                  isLastAssistant={message.id === lastAssistantId}
                  isLoading={isLoading}
                  isReasoningModel={isReasoningModel}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </ConversationContent>
        <ConversationDownload
          messages={messages.map((m) => ({ role: m.role, content: m.content }))}
        />
        <ConversationScrollButton />
      </Conversation>

      <div className="sticky bottom-0 border-t bg-background">
        <div className="max-w-3xl mx-auto w-full p-4">
          <ChatInput
            status={status}
            onSubmit={handleSubmit}
            onStop={stopGeneration}
            availableModels={availableModels}
            selectedModel={selectedModel}
            onSelectModel={selectModel}
            tokenUsage={tokenUsage}
            modelInfo={modelInfo ?? undefined}
            isLoading={isLoading}
            hasMessages={true}
            onClear={clearMessages}
            error={error ? error.message : null}
            onRegenerate={regenerate}
            isReasoningModel={isReasoningModel}
          />
        </div>
      </div>
    </div>
  );
}
