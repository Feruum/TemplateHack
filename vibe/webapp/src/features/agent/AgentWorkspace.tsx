import type {
  AgentDocument,
  AgentModule,
} from '@web-app-demo/contracts'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Typography } from '@/components/typography'
import { useAuth } from '@/features/auth'
import {
  getAgentDocuments,
  getAgentModules,
  isSupportedDocument,
  streamAgentChat,
  uploadAgentDocument,
} from './api'
import { readAgentEventStream } from './stream'

type AgentSource = {
  filename: string
  page?: number
  snippet?: string
}

type ToolStatus = {
  id: string
  name: string
  status: 'running' | 'ok' | 'error'
}

type ChatMessage = {
  id: string
  role: 'human' | 'assistant'
  content: string
  tools: ToolStatus[]
  sources: AgentSource[]
  error?: string
}

const pendingDocumentStatuses = new Set(['PENDING', 'QUEUED', 'PROCESSING'])

export function AgentWorkspace() {
  const { transport } = useAuth()
  const queryClient = useQueryClient()
  const [selectedModuleId, setSelectedModuleId] = useState('auto')
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streamError, setStreamError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadNotice, setUploadNotice] = useState<string | null>(null)
  const [threadId] = useState(createThreadId)
  const [isStreaming, setIsStreaming] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const endOfMessagesRef = useRef<HTMLDivElement>(null)
  const activeStreamRef = useRef<AbortController | null>(null)

  const moduleQuery = useQuery({
    queryKey: ['agent', 'modules'],
    queryFn: () => getAgentModules(transport),
  })
  const documentQuery = useQuery({
    queryKey: ['agent', 'documents'],
    queryFn: () => getAgentDocuments(transport),
    refetchInterval: (query) =>
      query.state.data?.documents.some((document) =>
        pendingDocumentStatuses.has(document.status),
      )
        ? 1500
        : false,
  })
  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadAgentDocument(transport, file),
    onSuccess: async (document) => {
      setUploadError(null)
      setUploadNotice(`“${document.filename}” is queued for indexing.`)
      await queryClient.invalidateQueries({ queryKey: ['agent', 'documents'] })
    },
    onError: (error: unknown) => {
      setUploadNotice(null)
      setUploadError(errorMessage(error))
    },
  })

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  useEffect(
    () => () => activeStreamRef.current?.abort(),
    [],
  )

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const content = draft.trim()
    if (!content || isStreaming) return

    const previousMessages = messages
      .filter((message) => message.content.trim())
      .map(({ role, content: messageContent }) => ({ type: role, content: messageContent }))
      .slice(-48)
    const humanId = createThreadId()
    const assistantId = createThreadId()
    const controller = new AbortController()
    const moduleId = selectedModuleId === 'auto' ? undefined : selectedModuleId

    setDraft('')
    setStreamError(null)
    setIsStreaming(true)
    activeStreamRef.current = controller
    setMessages((current) => [
      ...current,
      { id: humanId, role: 'human', content, tools: [], sources: [] },
      { id: assistantId, role: 'assistant', content: '', tools: [], sources: [] },
    ])

    try {
      const response = await streamAgentChat(
        transport,
        {
          messages: [...previousMessages, { type: 'human', content }],
          thread_id: threadId,
          ...(moduleId ? { module_id: moduleId } : {}),
        },
        controller.signal,
      )
      await readAgentEventStream(response, (event) => {
        updateAssistantMessage(assistantId, (message) => applyAgentEvent(message, event))
      }, controller.signal)
    } catch (error) {
      if (!controller.signal.aborted) setStreamError(errorMessage(error))
    } finally {
      if (activeStreamRef.current === controller) activeStreamRef.current = null
      setIsStreaming(false)
    }
  }

  function updateAssistantMessage(
    id: string,
    update: (message: ChatMessage) => ChatMessage,
  ) {
    setMessages((current) =>
      current.map((message) =>
        message.id === id ? update(message) : message,
      ),
    )
  }

  function selectFile(file: File | undefined) {
    setUploadError(null)
    setUploadNotice(null)
    if (!file) return
    if (!isSupportedDocument(file)) {
      setUploadError('Choose a PDF or TXT file no larger than 25 MiB.')
      return
    }
    uploadMutation.mutate(file)
  }

  const modules = moduleQuery.data?.modules ?? []
  const documents = documentQuery.data?.documents ?? []

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5 p-5 md:p-8">
      <div className="grid gap-2">
        <Typography as="h1" variant="h2">Agent workspace</Typography>
        <Typography tone="muted">
          Add documents, then ask questions. The backend routes each request to a module and keeps documents private to your account.
        </Typography>
      </div>

      <div className="grid min-h-[min(68vh,760px)] gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-h-[560px]">
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="grid gap-1">
                <CardTitle>Chat</CardTitle>
                <CardDescription>Pick a module or let the orchestrator choose.</CardDescription>
              </div>
              <Select value={selectedModuleId} onValueChange={setSelectedModuleId}>
                <SelectTrigger aria-label="Agent module" className="w-full sm:w-56">
                  <SelectValue placeholder="Choose a module" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automatic routing</SelectItem>
                  {modules.map((module) => (
                    <SelectItem key={module.id} value={module.id}>{module.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {moduleQuery.isError && (
              <InlineError message="Could not load agent modules. Check that the agent service is running." />
            )}
          </CardHeader>
          <CardContent className="flex min-h-[470px] flex-1 flex-col gap-4 py-4">
            <div aria-live="polite" className="flex-1 space-y-4 overflow-y-auto px-1">
              {messages.length === 0 ? (
                <div className="mx-auto grid max-w-lg gap-3 py-12 text-center">
                  <Typography as="h2" variant="h4">Start with a question</Typography>
                  <Typography tone="muted">
                    Upload a PDF or text file, then ask for a summary, explanation, or a specific fact.
                  </Typography>
                </div>
              ) : messages.map((message) => (
                <MessageView key={message.id} message={message} isStreaming={isStreaming} />
              ))}
              <div ref={endOfMessagesRef} />
            </div>

            {streamError && <InlineError message={streamError} />}

            <form className="grid gap-3 border-t pt-4" onSubmit={submitMessage}>
              <Textarea
                aria-label="Message"
                disabled={isStreaming || moduleQuery.isError}
                onChange={(event) => setDraft(event.currentTarget.value)}
                placeholder="Ask about your documents…"
                rows={3}
                value={draft}
              />
              <div className="flex justify-end">
                {isStreaming ? (
                  <Button
                    onClick={() => activeStreamRef.current?.abort()}
                    type="button"
                    variant="outline"
                  >
                    Stop response
                  </Button>
                ) : (
                  <Button disabled={!draft.trim() || moduleQuery.isError} type="submit">
                    Send question
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <aside className="grid content-start gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Knowledge base</CardTitle>
              <CardDescription>Only PDF and TXT files. Maximum size: 25 MiB.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <input
                accept=".pdf,.txt,application/pdf,text/plain"
                className="sr-only"
                onChange={(event) => {
                  selectFile(event.currentTarget.files?.[0])
                  event.currentTarget.value = ''
                }}
                ref={fileInputRef}
                type="file"
              />
              <Button
                disabled={uploadMutation.isPending}
                onClick={() => fileInputRef.current?.click()}
                type="button"
                variant="outline"
              >
                {uploadMutation.isPending ? 'Uploading…' : 'Add a document'}
              </Button>
              {uploadNotice && <Typography tone="muted" variant="bodySm">{uploadNotice}</Typography>}
              {uploadError && <InlineError message={uploadError} />}
              {documentQuery.isError && (
                <InlineError message="Could not load your documents. Check that the agent service is running." />
              )}
              <DocumentList documents={documents} isLoading={documentQuery.isPending} />
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Enabled modules</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {modules.length === 0 && !moduleQuery.isError ? (
                <Typography tone="muted" variant="bodySm">Loading modules…</Typography>
              ) : modules.map((module) => <ModuleSummary key={module.id} module={module} />)}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}

function MessageView({ message, isStreaming }: { message: ChatMessage; isStreaming: boolean }) {
  const isHuman = message.role === 'human'
  const waiting = !isHuman && !message.content && isStreaming

  return (
    <article className={`grid gap-2 ${isHuman ? 'ml-auto max-w-[85%]' : 'mr-auto max-w-[95%]'}`}>
      <Typography variant="caption" tone="muted">
        {isHuman ? 'You' : 'Agent'}
      </Typography>
      <div className={`rounded-lg px-4 py-3 ${isHuman ? 'bg-secondary' : 'bg-muted/60'}`}>
        {message.content ? (
          <Typography as="p" className="whitespace-pre-wrap" variant="bodySm">{message.content}</Typography>
        ) : waiting ? (
          <Typography tone="muted" variant="bodySm">Thinking…</Typography>
        ) : null}
        {message.tools.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.tools.map((tool) => (
              <Badge key={tool.id} variant={tool.status === 'error' ? 'destructive' : 'secondary'}>
                {tool.name}: {tool.status}
              </Badge>
            ))}
          </div>
        )}
      </div>
      {message.error && <InlineError message={message.error} />}
      {message.sources.length > 0 && (
        <div className="grid gap-2">
          <Typography variant="caption" tone="muted">Sources</Typography>
          {message.sources.map((source, index) => (
            <div className="rounded-md border px-3 py-2" key={`${source.filename}-${source.page ?? ''}-${index}`}>
              <Typography variant="bodySmMedium">{source.filename}{source.page ? ` · page ${source.page}` : ''}</Typography>
              {source.snippet && <Typography className="mt-1 whitespace-pre-wrap" tone="muted" variant="bodyXs">{source.snippet}</Typography>}
            </div>
          ))}
        </div>
      )}
    </article>
  )
}

function DocumentList({ documents, isLoading }: { documents: AgentDocument[]; isLoading: boolean }) {
  if (isLoading) return <Typography tone="muted" variant="bodySm">Loading documents…</Typography>
  if (documents.length === 0) {
    return <Typography tone="muted" variant="bodySm">Your private knowledge base is empty.</Typography>
  }

  return (
    <ul className="grid gap-2">
      {documents.map((document) => (
        <li className="flex min-w-0 items-start justify-between gap-3 rounded-md border px-3 py-2" key={document.id}>
          <div className="grid min-w-0 gap-1">
            <Typography className="truncate" variant="bodySmMedium">{document.filename}</Typography>
            {pendingDocumentStatuses.has(document.status) && (
              <Typography tone="muted" variant="caption">Indexing · {document.progress}%</Typography>
            )}
            {document.status === 'FAILED' && (
              <Typography tone="destructive" variant="caption">{document.error_message ?? 'Indexing failed'}</Typography>
            )}
          </div>
          <Badge variant={document.status === 'FAILED' ? 'destructive' : document.status === 'COMPLETED' ? 'default' : 'secondary'}>
            {document.status.toLowerCase()}
          </Badge>
        </li>
      ))}
    </ul>
  )
}

function ModuleSummary({ module }: { module: AgentModule }) {
  return (
    <div className="grid gap-1">
      <Typography variant="bodySmMedium">{module.name}</Typography>
      <Typography tone="muted" variant="caption">{module.description}</Typography>
    </div>
  )
}

function InlineError({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Request failed</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

function applyAgentEvent(message: ChatMessage, event: { type: string; data: unknown }): ChatMessage {
  const data = asRecord(event.data)

  if (event.type === 'token') {
    const content = readString(data.content)
    return content ? { ...message, content: message.content + content } : message
  }
  if (event.type === 'source') {
    const source = toAgentSource(data)
    return source ? addSource(message, source) : message
  }
  if (event.type === 'sources') {
    const sources = Array.isArray(data.sources) ? data.sources : []
    return sources.reduce((current, item) => {
      const source = toAgentSource(asRecord(item))
      return source ? addSource(current, source) : current
    }, message)
  }
  if (event.type === 'tool_status') {
    return updateTool(message, data)
  }
  if (event.type === 'data') {
    const kind = readString(data.type)
    if (kind === 'tool_call_start' || kind === 'tool_call_end') return updateTool(message, data)
    if (kind === 'source') {
      const source = toAgentSource(data)
      return source ? addSource(message, source) : message
    }
    if (kind === 'sources' && Array.isArray(data.sources)) {
      return data.sources.reduce((current, item) => {
        const source = toAgentSource(asRecord(item))
        return source ? addSource(current, source) : current
      }, message)
    }
  }
  if (event.type === 'error') {
    return { ...message, error: readString(data.error) ?? readString(data.message) ?? 'The agent failed to answer.' }
  }
  return message
}

function updateTool(message: ChatMessage, data: Record<string, unknown>): ChatMessage {
  const name = readString(data.tool) ?? 'tool'
  const id = readString(data.id) ?? name
  const status = data.status === 'error' ? 'error' : data.status === 'ok' ? 'ok' : 'running'
  const nextTool: ToolStatus = { id, name, status }
  const tools = message.tools.some((tool) => tool.id === id)
    ? message.tools.map((tool) => tool.id === id ? nextTool : tool)
    : [...message.tools, nextTool]
  const error = status === 'error' ? readString(data.error) : message.error
  return { ...message, tools, ...(error ? { error } : {}) }
}

function addSource(message: ChatMessage, source: AgentSource): ChatMessage {
  const exists = message.sources.some((item) => item.filename === source.filename && item.page === source.page && item.snippet === source.snippet)
  return exists ? message : { ...message, sources: [...message.sources, source] }
}

function toAgentSource(data: Record<string, unknown>): AgentSource | null {
  const filename = readString(data.filename) ?? readString(data.source) ?? readString(data.title)
  if (!filename) return null
  const page = typeof data.page === 'number' && Number.isInteger(data.page) ? data.page : undefined
  const snippet = readString(data.snippet) ?? readString(data.excerpt) ?? readString(data.content)
  return { filename, ...(page !== undefined ? { page } : {}), ...(snippet ? { snippet } : {}) }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The request could not be completed.'
}

function createThreadId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
