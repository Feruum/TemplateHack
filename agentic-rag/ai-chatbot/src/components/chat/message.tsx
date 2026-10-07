"use client";

import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "@/hooks/use-langserve-chat";
import { Bot, User, Loader2 } from "lucide-react";

interface MessageProps {
  message: ChatMessage;
}

export function Message({ message }: MessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "group flex gap-3 px-4 py-6",
        isUser ? "bg-transparent" : "bg-zinc-50 dark:bg-zinc-900"
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-lg border shadow-sm",
          isUser
            ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
            : "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white border-0"
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div className="flex-1 space-y-2 overflow-hidden">
        <div className="prose prose-zinc dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 max-w-none">
          {message.isStreaming && !message.content ? (
            <div className="flex items-center gap-2 text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Thinking...</span>
            </div>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="mb-2 ml-4 list-disc">{children}</ul>,
                ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal">{children}</ol>,
                li: ({ children }) => <li className="mb-1">{children}</li>,
                code: ({ className, children, ...props }) => {
                  const match = /language-(\w+)/.exec(className || "");
                  const isInline = !match;
                  return isInline ? (
                    <code
                      className="rounded bg-zinc-200 px-1.5 py-0.5 font-mono text-sm dark:bg-zinc-800"
                      {...props}
                    >
                      {children}
                    </code>
                  ) : (
                    <pre className="my-2 overflow-x-auto rounded-lg bg-zinc-900 p-4 dark:bg-zinc-950">
                      <code className="font-mono text-sm text-zinc-100" {...props}>
                        {children}
                      </code>
                    </pre>
                  );
                },
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-600 underline decoration-violet-600/30 underline-offset-2 hover:decoration-violet-600 dark:text-violet-400"
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          )}
          {message.isStreaming && message.content && (
            <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-violet-500" />
          )}
        </div>
      </div>
    </div>
  );
}
