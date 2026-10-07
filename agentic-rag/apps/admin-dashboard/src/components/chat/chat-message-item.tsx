"use client";

import {
  Copy01Icon,
  Edit01Icon,
  RefreshIcon,
  Tick01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";

import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Source, Sources, SourcesContent, SourcesTrigger } from "@/components/ai-elements/sources";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import type { ChatMessage, ToolCallStatus } from "@/hooks/use-agent-chat";

// ============================================================================
// Helper Components
// ============================================================================

function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <MessageAction
      tooltip={copied ? "Copied!" : "Copy"}
      onClick={handleCopy}
      className="opacity-0 group-hover:opacity-100 transition-opacity"
    >
      <HugeiconsIcon icon={copied ? Tick01Icon : Copy01Icon} className="size-3.5" />
    </MessageAction>
  );
}

function UserAvatar() {
  return (
    <div className="size-7 rounded-full bg-muted flex items-center justify-center shrink-0">
      <HugeiconsIcon icon={UserIcon} className="size-3.5 text-muted-foreground" />
    </div>
  );
}

function mapToolStatus(
  status: ToolCallStatus["status"]
): "input-available" | "output-available" | "output-error" {
  switch (status) {
    case "running":
      return "input-available";
    case "completed":
      return "output-available";
    case "error":
      return "output-error";
    default:
      return "input-available";
  }
}

function ToolCallsDisplay({ toolCalls }: { toolCalls: ToolCallStatus[] }) {
  if (!toolCalls.length) return null;

  return (
    <div className="flex flex-col gap-2 animate-in fade-in-0 duration-200">
      {toolCalls.map((tool) => (
        <Tool key={tool.id} defaultOpen={tool.status === "running"}>
          <ToolHeader
            title={tool.name.replace(/_/g, " ")}
            type="tool-call"
            state={mapToolStatus(tool.status)}
          />
          <ToolContent>
            {tool.args && <ToolInput input={tool.args} />}
            {(tool.resultPreview !== undefined || tool.error) && (
              <ToolOutput output={tool.resultPreview} errorText={tool.error} />
            )}
          </ToolContent>
        </Tool>
      ))}
    </div>
  );
}

function SourcesDisplay({ sources }: { sources: ChatMessage["sources"] }) {
  if (!sources || sources.length === 0) return null;

  return (
    <Sources className="mt-3">
      <SourcesTrigger count={sources.length} />
      <SourcesContent>
        {sources.map((source, idx) => (
          <Source
            key={`${source.title || source.url || idx}`}
            href={source.url || "#"}
            title={source.title || `Source ${idx + 1}`}
          />
        ))}
      </SourcesContent>
    </Sources>
  );
}

// ============================================================================
// Main Component
// ============================================================================

interface ChatMessageItemProps {
  message: ChatMessage;
  onEdit?: (messageId: string, content: string) => void;
  onRegenerate?: () => void;
  isLastAssistant?: boolean;
  isLoading?: boolean;
  isReasoningModel?: boolean;
}

export function ChatMessageItem({
  message,
  onEdit,
  onRegenerate,
  isLastAssistant,
  isLoading,
  isReasoningModel,
}: ChatMessageItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isUser = message.role === "user";

  const showReasoning =
    isReasoningModel && !isUser && (message.isStreaming || !!message.thinkingDuration);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length
      );
    }
  }, [isEditing]);

  const handleEdit = () => {
    setEditContent(message.content);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (editContent.trim() && editContent !== message.content) {
      onEdit?.(message.id, editContent);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditContent(message.content);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleCancelEdit();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSaveEdit();
    }
  };

  if (isUser) {
    return (
      <Message from="user">
        <div className="flex gap-3 justify-end">
          <div className="group flex flex-col gap-1.5 max-w-[80%]">
            {isEditing ? (
              <div className="flex flex-col gap-2">
                <textarea
                  ref={textareaRef}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="bg-muted rounded-2xl px-4 py-2.5 text-sm resize-none min-h-20 focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <div className="flex gap-2 justify-end items-center">
                  <span className="text-xs text-muted-foreground mr-2">
                    Esc to cancel · ⌘↵ to save
                  </span>
                  <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSaveEdit}>
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <MessageContent>
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </MessageContent>
                <MessageActions className="justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                  <MessageAction tooltip="Edit" onClick={handleEdit} disabled={isLoading}>
                    <HugeiconsIcon icon={Edit01Icon} className="size-3.5" />
                  </MessageAction>
                </MessageActions>
              </>
            )}
          </div>
          <UserAvatar />
        </div>
      </Message>
    );
  }

  return (
    <Message from="assistant">
      <div className="flex flex-col gap-1.5 min-w-0 flex-1">
        <MessageContent className="max-w-none">
          {showReasoning && (
            <Reasoning
              isStreaming={message.isStreaming && !message.content?.trim()}
              duration={
                message.thinkingDuration ? Math.round(message.thinkingDuration / 1000) : undefined
              }
            >
              <ReasoningTrigger />
              {message.thinkingContent && (
                <ReasoningContent>{message.thinkingContent}</ReasoningContent>
              )}
            </Reasoning>
          )}

          {message.toolCalls && message.toolCalls.length > 0 && (
            <ToolCallsDisplay toolCalls={message.toolCalls} />
          )}

          {message.content?.trim() && (
            <div className="group">
              <MessageResponse mode={message.isStreaming ? "streaming" : "static"}>
                {message.content}
              </MessageResponse>

              {!message.isStreaming && <SourcesDisplay sources={message.sources} />}

              {!message.isStreaming && (
                <MessageActions className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <CopyButton content={message.content} />
                  {isLastAssistant && onRegenerate && (
                    <MessageAction tooltip="Regenerate" onClick={onRegenerate} disabled={isLoading}>
                      <HugeiconsIcon icon={RefreshIcon} className="size-3.5" />
                    </MessageAction>
                  )}
                </MessageActions>
              )}
            </div>
          )}
        </MessageContent>
      </div>
    </Message>
  );
}
