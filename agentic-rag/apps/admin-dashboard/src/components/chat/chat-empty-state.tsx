"use client";

import { motion } from "motion/react";

import { ConversationEmptyState } from "@/components/ai-elements/conversation";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";

const SUGGESTIONS = [
  "What documents do I have?",
  "Summarize the main topics",
  "Find key insights",
  "What are the action items?",
];

interface ChatEmptyStateProps {
  onSelectSuggestion: (suggestion: string) => void;
}

export function ChatEmptyState({ onSelectSuggestion }: ChatEmptyStateProps) {
  return (
    <ConversationEmptyState className="max-w-xl mx-auto px-4">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="flex flex-col items-center text-center w-full"
      >
        <h2 className="text-xl font-semibold mb-2">Start a conversation</h2>
        <p className="text-muted-foreground text-sm mb-8 max-w-sm">
          Ask questions about your documents. I&apos;ll search through your uploaded files to
          provide accurate, contextual answers.
        </p>

        <Suggestions className="w-full justify-center flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <Suggestion key={suggestion} suggestion={suggestion} onClick={onSelectSuggestion} />
          ))}
        </Suggestions>
      </motion.div>
    </ConversationEmptyState>
  );
}
