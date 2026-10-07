"use client";

import type { HTMLAttributes } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  totalTokens: number;
  maxTokens: number;
}

export interface ContextUsageProps extends HTMLAttributes<HTMLDivElement> {
  usage: TokenUsage;
  /** Cost per 1M input tokens in USD */
  inputCostPer1M?: number;
  /** Cost per 1M output tokens in USD */
  outputCostPer1M?: number;
  size?: "sm" | "md";
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toString();
}

function calculateCost(
  inputTokens: number,
  outputTokens: number,
  inputCostPer1M: number,
  outputCostPer1M: number
): number {
  const inputCost = (inputTokens / 1_000_000) * inputCostPer1M;
  const outputCost = (outputTokens / 1_000_000) * outputCostPer1M;
  return inputCost + outputCost;
}

function CircularProgress({
  value,
  size,
  strokeWidth = 2,
  className,
}: {
  value: number;
  size: number;
  strokeWidth?: number;
  className?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("transform -rotate-90", className)}
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-muted/50"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className={cn(
          "transition-all duration-300",
          value < 50 ? "text-muted-foreground" : value < 80 ? "text-amber-500" : "text-red-500"
        )}
      />
    </svg>
  );
}

export function ContextUsage({
  usage,
  inputCostPer1M = 0.1,
  outputCostPer1M = 0.3,
  size = "sm",
  className,
  ...props
}: ContextUsageProps) {
  const percentage = Math.min(Math.round((usage.totalTokens / usage.maxTokens) * 100), 100);
  const cost = calculateCost(
    usage.inputTokens,
    usage.outputTokens,
    inputCostPer1M,
    outputCostPer1M
  );

  const circleSize = size === "sm" ? 20 : 28;
  const strokeWidth = size === "sm" ? 2 : 3;

  return (
    <HoverCard>
      <HoverCardTrigger>
        <div className={cn("flex items-center gap-1.5 cursor-default", className)} {...props}>
          <CircularProgress value={percentage} size={circleSize} strokeWidth={strokeWidth} />
          <span
            className={cn(
              "text-muted-foreground tabular-nums",
              size === "sm" ? "text-[10px]" : "text-xs"
            )}
          >
            {formatTokens(usage.totalTokens)}
          </span>
        </div>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="end" className="w-56">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Context Window</span>
            <span className="text-xs text-muted-foreground tabular-nums">{percentage}% used</span>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Input tokens</span>
              <span className="tabular-nums">{formatTokens(usage.inputTokens)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Output tokens</span>
              <span className="tabular-nums">{formatTokens(usage.outputTokens)}</span>
            </div>
            {usage.cachedTokens !== undefined && usage.cachedTokens > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Cached</span>
                <span className="tabular-nums text-green-600">
                  {formatTokens(usage.cachedTokens)}
                </span>
              </div>
            )}
            <div className="border-t border-border/50 pt-2 flex justify-between text-xs">
              <span className="text-muted-foreground">Total</span>
              <span className="tabular-nums font-medium">
                {formatTokens(usage.totalTokens)} / {formatTokens(usage.maxTokens)}
              </span>
            </div>
          </div>

          <div className="border-t border-border/50 pt-2 flex justify-between text-xs">
            <span className="text-muted-foreground">Est. cost</span>
            <span className="tabular-nums font-medium">${cost.toFixed(4)}</span>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

export function ContextUsageSkeleton({
  size = "sm",
  className,
}: {
  size?: "sm" | "md";
  className?: string;
}) {
  const circleSize = size === "sm" ? 20 : 28;

  return (
    <div className={cn("flex items-center gap-1.5 animate-pulse", className)}>
      <div className="rounded-full bg-muted" style={{ width: circleSize, height: circleSize }} />
      <div className={cn("bg-muted rounded", size === "sm" ? "h-2.5 w-8" : "h-3 w-10")} />
    </div>
  );
}
