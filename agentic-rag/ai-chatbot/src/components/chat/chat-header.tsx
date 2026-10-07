"use client";

import { Bot, Trash2, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useCallback, useEffect } from "react";

interface ChatHeaderProps {
  onClear: () => void;
  hasMessages: boolean;
  threadId: string;
}

export function ChatHeader({ onClear, hasMessages, threadId }: ChatHeaderProps) {
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const copyThreadId = useCallback(async () => {
    await navigator.clipboard.writeText(threadId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [threadId]);

  const displayThreadId = mounted ? `${threadId.slice(0, 8)}...` : "Loading...";

  return (
    <header className="flex items-center justify-between border-b bg-white px-4 py-3 dark:bg-zinc-950">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500">
          <Bot className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="font-semibold">RAG Assistant</h1>
          <button
            onClick={copyThreadId}
            className="flex items-center gap-1 text-xs text-zinc-400 transition-colors hover:text-zinc-600"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                {displayThreadId}
              </>
            )}
          </button>
        </div>
      </div>
      {hasMessages && (
        <button
          onClick={onClear}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-zinc-500 transition-colors",
            "hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          )}
        >
          <Trash2 className="h-4 w-4" />
          Clear
        </button>
      )}
    </header>
  );
}
