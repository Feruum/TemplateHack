"use client";

import { BrainIcon, ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AvailableModel } from "@/hooks/use-agent-chat";
import { cn } from "@/lib/utils";

interface ModelSelectorButtonProps {
  models: AvailableModel[];
  selectedModel: string | null;
  onSelect: (modelId: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function ModelSelectorButton({
  models,
  selectedModel,
  onSelect,
  disabled,
  compact,
}: ModelSelectorButtonProps) {
  const [open, setOpen] = useState(false);
  const selected = models.find((m) => m.id === selectedModel);
  const freeModels = models.filter((m) => m.tier === "free");
  const paidModels = models.filter((m) => m.tier === "paid");

  return (
    <ModelSelector open={open} onOpenChange={setOpen}>
      <ModelSelectorTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className={cn("gap-1.5 text-muted-foreground h-7 px-2", compact && "h-6 px-1.5")}
            disabled={disabled}
          >
            <ModelSelectorLogo provider="mistral" className={compact ? "size-3.5" : "size-4"} />
            <span
              className={cn(
                "font-medium truncate",
                compact ? "text-[11px] max-w-28" : "text-xs max-w-40"
              )}
            >
              {selected?.name || "Select model"}
            </span>
            {!compact && selected?.capabilities.includes("reasoning") && (
              <BrainIcon className="size-3 text-muted-foreground" />
            )}
            {!compact &&
              selected?.tier === "free" &&
              !selected?.capabilities.includes("reasoning") && (
                <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                  Free
                </Badge>
              )}
            <ChevronDownIcon className={compact ? "size-2.5" : "size-3"} />
          </Button>
        }
      />
      <ModelSelectorContent>
        <ModelSelectorInput placeholder="Search models..." />
        <ModelSelectorList>
          <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
          {freeModels.length > 0 && (
            <ModelSelectorGroup heading="Free Tier">
              {freeModels.map((model) => (
                <ModelSelectorItem
                  key={model.id}
                  value={model.id}
                  onSelect={() => {
                    onSelect(model.id);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2"
                >
                  <ModelSelectorLogo provider="mistral" />
                  <ModelSelectorName>{model.name}</ModelSelectorName>
                  {model.capabilities.includes("reasoning") && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 gap-0.5">
                      <BrainIcon className="size-2.5" />
                      Reasoning
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {Math.round(model.contextWindow / 1000)}K ctx
                  </span>
                </ModelSelectorItem>
              ))}
            </ModelSelectorGroup>
          )}
          {paidModels.length > 0 && (
            <ModelSelectorGroup heading="Paid Tier">
              {paidModels.map((model) => (
                <ModelSelectorItem
                  key={model.id}
                  value={model.id}
                  onSelect={() => {
                    onSelect(model.id);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2"
                >
                  <ModelSelectorLogo provider="mistral" />
                  <ModelSelectorName>{model.name}</ModelSelectorName>
                  {model.capabilities.includes("reasoning") && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 gap-0.5">
                      <BrainIcon className="size-2.5" />
                      Reasoning
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {Math.round(model.contextWindow / 1000)}K ctx
                  </span>
                </ModelSelectorItem>
              ))}
            </ModelSelectorGroup>
          )}
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );
}
