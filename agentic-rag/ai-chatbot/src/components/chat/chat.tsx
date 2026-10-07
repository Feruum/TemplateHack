"use client";

import { useLangServeChat } from "@/hooks/use-langserve-chat";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { ChatHeader } from "./chat-header";

interface ChatProps {
  userId?: string;
}

export function Chat({ userId }: ChatProps) {
  const { messages, isLoading, sendMessage, stop, clear, threadId } = useLangServeChat({
    userId,
  });

  return (
    <div className="flex h-screen flex-col bg-white dark:bg-zinc-950">
      <ChatHeader onClear={clear} hasMessages={messages.length > 0} threadId={threadId} />
      <MessageList messages={messages} />
      <ChatInput onSend={sendMessage} onStop={stop} isLoading={isLoading} />
    </div>
  );
}
