"use client";

import { Delete01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon, BrainIcon } from "lucide-react";

import { ContextUsage } from "@/components/ai-elements/context-usage";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { AvailableModel, ChatStatus, ModelInfo, TokenUsage } from "@/hooks/use-agent-chat";

import { ModelSelectorButton } from "./model-selector-button";

interface ChatInputProps {
  status: ChatStatus;
  onSubmit: (data: { text: string; files: unknown[] }) => Promise<void> | void;
  onStop: () => void;
  availableModels: AvailableModel[];
  selectedModel: string | null;
  onSelectModel: (id: string) => void;
  tokenUsage: TokenUsage;
  modelInfo?: ModelInfo;
  isLoading: boolean;
  onClear?: () => void;
  hasMessages: boolean;
  error?: string | null;
  onRegenerate?: () => void;
  isReasoningModel?: boolean;
}

export function ChatInput({
  status,
  onSubmit,
  onStop,
  availableModels,
  selectedModel,
  onSelectModel,
  tokenUsage,
  modelInfo,
  isLoading,
  onClear,
  hasMessages,
  error,
  onRegenerate,
  isReasoningModel,
}: ChatInputProps) {
  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-4">
      {error && (
        <div className="flex items-center gap-2 px-4 py-2 text-sm text-destructive bg-destructive/10 rounded-lg animate-in fade-in slide-in-from-bottom-2">
          <AlertCircleIcon className="size-4 shrink-0" />
          <span className="flex-1">{error}</span>
          {onRegenerate && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRegenerate}
              className="h-7 hover:bg-destructive/20"
            >
              Retry
            </Button>
          )}
        </div>
      )}

      <PromptInput
        onSubmit={onSubmit}
        className="max-w-none border border-border/60 rounded-xl shadow-sm bg-background"
      >
        <PromptInputTextarea placeholder="Ask anything..." />
        <PromptInputFooter>
          <PromptInputTools>
            <ModelSelectorButton
              models={availableModels}
              selectedModel={selectedModel}
              onSelect={onSelectModel}
              disabled={isLoading}
              compact
            />
            {isReasoningModel && (
              <>
                <span className="text-muted-foreground/30">•</span>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <BrainIcon className="size-3" />
                  Reasoning
                </span>
              </>
            )}
            {tokenUsage.totalTokens > 0 && (
              <>
                <span className="text-muted-foreground/30">•</span>
                <ContextUsage
                  usage={tokenUsage}
                  size="sm"
                  inputCostPer1M={modelInfo?.inputCostPer1M}
                  outputCostPer1M={modelInfo?.outputCostPer1M}
                />
              </>
            )}
          </PromptInputTools>

          <div className="flex items-center gap-2">
            {hasMessages && onClear && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={onClear}
                        className="text-muted-foreground hover:text-foreground h-8 w-8"
                      >
                        <HugeiconsIcon icon={Delete01Icon} className="size-4" />
                      </Button>
                    }
                  />
                  <TooltipContent>
                    <p>Clear conversation</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {status === "ready" ? (
              <kbd className="hidden sm:inline text-[10px] text-muted-foreground/50 font-sans select-none">
                ⌘↵
              </kbd>
            ) : null}
            <PromptInputSubmit status={status} onStop={onStop} />
          </div>
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
