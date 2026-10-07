"use client";

import { useState, useRef, useCallback, KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { Send, Square, CornerDownLeft } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop: () => void;
  isLoading: boolean;
  disabled?: boolean;
}

export function ChatInput({ onSend, onStop, isLoading, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    if (!value.trim() || disabled) return;
    onSend(value);
    setValue("");
    textareaRef.current?.focus();
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (isLoading) {
          onStop();
        } else {
          handleSubmit();
        }
      }
    },
    [isLoading, onStop, handleSubmit]
  );

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, []);

  return (
    <div className="border-t bg-white p-4 dark:bg-zinc-950">
      <div className="mx-auto max-w-3xl">
        <div className="relative flex items-end gap-2 rounded-2xl border bg-zinc-50 p-2 shadow-sm dark:bg-zinc-900">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              adjustHeight();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your documents..."
            disabled={disabled}
            rows={1}
            className={cn(
              "max-h-[200px] min-h-[44px] flex-1 resize-none bg-transparent px-3 py-3 text-sm placeholder:text-zinc-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
              "scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700"
            )}
          />
          <button
            onClick={isLoading ? onStop : handleSubmit}
            disabled={disabled || (!isLoading && !value.trim())}
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all",
              isLoading
                ? "bg-red-500 text-white hover:bg-red-600"
                : value.trim()
                ? "bg-violet-600 text-white hover:bg-violet-700"
                : "bg-zinc-200 text-zinc-400 dark:bg-zinc-800"
            )}
          >
            {isLoading ? (
              <Square className="h-4 w-4 fill-current" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        <div className="mt-2 flex items-center justify-center gap-1 text-xs text-zinc-400">
          <CornerDownLeft className="h-3 w-3" />
          <span>Enter to send, Shift+Enter for new line</span>
        </div>
      </div>
    </div>
  );
}
