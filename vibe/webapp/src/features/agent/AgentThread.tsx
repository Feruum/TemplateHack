import { useMemo, useState } from 'react'
import {
  AssistantRuntimeProvider, ComposerPrimitive, MessagePrimitive,
  ThreadPrimitive, useAuiState, useLocalRuntime, type TextMessagePartProps,
} from '@assistant-ui/react'
import { ArcBadge, ArcEmptyState } from '@/components/arc'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Typography } from '@/components/typography'
import type { AuthenticatedTransport } from '@/platform/api'
import { createAgentModelAdapter, type RagMetadata } from './runtime'

export function AgentThread({ transport, moduleId, disabled }: {
  transport: AuthenticatedTransport; moduleId?: string; disabled: boolean
}) {
  const [threadId] = useState(() => crypto.randomUUID())
  const adapter = useMemo(() => createAgentModelAdapter(transport, { threadId, moduleId }), [transport, threadId, moduleId])
  const runtime = useLocalRuntime(adapter)
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col gap-4" data-testid="agent-thread">
        <ThreadPrimitive.Viewport className="min-h-0 flex-1 overflow-y-auto px-1" aria-label="Conversation" role="log" aria-live="polite">
          <ThreadPrimitive.Empty>
            <ArcEmptyState title="Start with a question" description="Upload a PDF or text file, then ask for a summary, explanation, or a specific fact." label="Empty conversation" />
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages components={{ UserMessage: ChatMessage, AssistantMessage: ChatMessage }} />
        </ThreadPrimitive.Viewport>
        <Composer disabled={disabled} />
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  )
}

function Composer({ disabled }: { disabled: boolean }) {
  const running = useAuiState((state) => state.thread.isRunning)
  return (
    <ComposerPrimitive.Root className="grid gap-3 border-t pt-4" data-testid="agent-composer">
      <ComposerPrimitive.Input asChild disabled={disabled || running} submitMode="ctrlEnter" addAttachmentOnPaste={false} maxLength={32000}>
        <Textarea aria-label="Message" placeholder="Ask about your documents…" rows={3} />
      </ComposerPrimitive.Input>
      <div className="flex justify-end">
        {running ? (
          <ComposerPrimitive.Cancel asChild><Button type="button" variant="outline" data-testid="agent-stop">Stop response</Button></ComposerPrimitive.Cancel>
        ) : (
          <ComposerPrimitive.Send asChild disabled={disabled}><Button type="submit" data-testid="agent-send">Send question</Button></ComposerPrimitive.Send>
        )}
      </div>
    </ComposerPrimitive.Root>
  )
}

function PlainText({ text }: TextMessagePartProps) {
  return <Typography as="p" className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]" variant="bodySm">{text}</Typography>
}

function ChatMessage() {
  const message = useAuiState((state) => state.message)
  const human = message.role === 'user'
  const rag = message.metadata.custom.rag as RagMetadata | undefined
  const waiting = message.status?.type === 'running' && !message.content.some((part) => part.type === 'text' && part.text)
  const failure = message.status?.type === 'incomplete' && message.status.reason === 'error' ? message.status.error : null
  const failureText = typeof failure === 'string' ? failure
    : failure && typeof failure === 'object' && 'message' in failure && typeof failure.message === 'string' ? failure.message
    : 'The request could not be completed.'
  return (
    <MessagePrimitive.Root className={`mb-4 grid min-w-0 gap-2 ${human ? 'ml-auto max-w-[85%]' : 'mr-auto max-w-[95%]'}`} data-testid={human ? 'agent-user-message' : 'agent-assistant-message'}>
      <Typography variant="caption" tone="muted">{human ? 'You' : 'Agent'}</Typography>
      <div className={`min-w-0 rounded-lg px-4 py-3 ${human ? 'bg-secondary' : 'bg-muted/60'}`}>
        <MessagePrimitive.Content components={{ Text: PlainText }} />
        {waiting && <Typography tone="muted" variant="bodySm">Thinking…</Typography>}
        {(rag?.tools.length ?? 0) > 0 && <div className="mt-3 flex flex-wrap gap-2" data-testid="agent-tools">
          {rag!.tools.map((tool) => <div key={tool.id} className="grid gap-1">
            <ArcBadge tone={tool.status === 'error' ? 'danger' : tool.status === 'ok' ? 'success' : 'warning'} size="sm">{`${tool.name}: ${tool.status}`}</ArcBadge>
            {tool.error && <Typography variant="bodyXs" tone="destructive">{tool.error}</Typography>}
          </div>)}
        </div>}
      </div>
      {failure && <Alert variant="destructive" data-testid="agent-error"><AlertTitle>Request failed</AlertTitle><AlertDescription>{failureText}</AlertDescription></Alert>}
      {(rag?.sources.length ?? 0) > 0 && <div className="grid min-w-0 gap-2" data-testid="agent-sources">
        <Typography variant="caption" tone="muted">Sources</Typography>
        {rag!.sources.map((source, index) => <div className="min-w-0 rounded-md border px-3 py-2 [overflow-wrap:anywhere]" key={`${source.filename}-${source.page ?? ''}-${index}`}>
          <Typography variant="bodySmMedium">{source.filename}{source.page ? ` · page ${source.page}` : ''}</Typography>
          {source.snippet && <Typography className="mt-1 whitespace-pre-wrap" tone="muted" variant="bodyXs">{source.snippet}</Typography>}
        </div>)}
      </div>}
    </MessagePrimitive.Root>
  )
}
