"use client";

import { useRef, useEffect } from "react";
import type { ChatMessage } from "@/hooks/use-langserve-chat";
import { Message } from "./message";
import { Bot, Sparkles } from "lucide-react";

interface MessageListProps {
  messages: ChatMessage[];
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/20">
          <Bot className="h-10 w-10 text-white" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">RAG Assistant</h2>
          <p className="max-w-sm text-zinc-500 dark:text-zinc-400">
            Ask questions about your documents. I&apos;ll search through your files
            and provide relevant answers with sources.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {[
            "What documents do I have?",
            "Summarize my recent uploads",
            "Search for technical specs",
          ].map((suggestion) => (
            <button
              key={suggestion}
              className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-600 transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-violet-600 dark:hover:bg-violet-950 dark:hover:text-violet-300"
            >
              <Sparkles className="h-3 w-3" />
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {messages.map((message) => (
        <Message key={message.id} message={message} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
