import type { ChatModelAdapter, ChatModelRunResult, ThreadMessage } from '@assistant-ui/react'
import type { AgentChatRequest } from '@web-app-demo/contracts'
import type { AuthenticatedTransport } from '@/platform/api'
import { streamAgentChat } from './api'
import { iterateAgentEventStream, type AgentStreamEvent } from './stream'

export type AgentSource = { filename: string; page?: number; snippet?: string }
export type ToolStatus = { id: string; name: string; status: 'running' | 'ok' | 'error'; error?: string }
export type RagMetadata = { sources: AgentSource[]; tools: ToolStatus[] }
type ResponseState = RagMetadata & { text: string; error?: string }

export function toAgentMessages(messages: readonly ThreadMessage[]): AgentChatRequest['messages'] {
  return messages.flatMap((message) => {
    if (message.role !== 'user' && message.role !== 'assistant') return []
    const content = message.content.filter((part) => part.type === 'text').map((part) => part.text).join('\n').trim()
    return content ? [{ type: message.role === 'user' ? 'human' as const : 'assistant' as const, content }] : []
  }).slice(-49)
}

export function createAgentModelAdapter(
  transport: AuthenticatedTransport,
  { threadId, moduleId }: { threadId: string; moduleId?: string },
): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      const response = await streamAgentChat(transport, {
        messages: toAgentMessages(messages), thread_id: threadId,
        ...(moduleId ? { module_id: moduleId } : {}),
      }, abortSignal)
      let state: ResponseState = { text: '', sources: [], tools: [] }
      for await (const event of iterateAgentEventStream(response, abortSignal)) {
        state = applyAgentEvent(state, event)
        const result: ChatModelRunResult = {
          content: [{ type: 'text', text: state.text }],
          metadata: { custom: { rag: { sources: state.sources, tools: state.tools } } },
        }
        if (state.error) {
          yield { ...result, status: { type: 'incomplete', reason: 'error', error: state.error } }
          return
        }
        if (event.type === 'end') {
          yield { ...result, status: { type: 'complete', reason: 'stop' } }
          return
        }
        yield result
      }
      throw new Error('The agent response was interrupted. Send your question again.')
    },
  }
}

function applyAgentEvent(state: ResponseState, event: AgentStreamEvent): ResponseState {
  const data = asRecord(event.data)
  if (event.type === 'data' && typeof data.type === 'string' && data.type !== 'data') return applyAgentEvent(state, { type: data.type, data })
  if (event.type === 'token') return { ...state, text: state.text + (readString(data.content) ?? '') }
  if (event.type === 'error') return { ...state, error: readString(data.error) ?? readString(data.message) ?? 'The agent failed to answer.' }
  if (event.type === 'source' || event.type === 'sources') {
    const incoming = event.type === 'source' ? [data] : Array.isArray(data.sources) ? data.sources : []
    const sources = [...state.sources]
    for (const item of incoming) {
      const value = asRecord(item)
      const filename = readString(value.filename) ?? readString(value.source) ?? readString(value.title)
      if (!filename) continue
      const page = typeof value.page === 'number' && Number.isInteger(value.page) ? value.page : undefined
      const snippet = readString(value.snippet) ?? readString(value.excerpt) ?? readString(value.content)
      const source = { filename, ...(page !== undefined ? { page } : {}), ...(snippet ? { snippet } : {}) }
      if (!sources.some((existing) => existing.filename === filename && existing.page === page && existing.snippet === snippet)) sources.push(source)
    }
    return { ...state, sources }
  }
  if (['tool_status', 'tool_call_start', 'tool_call_end'].includes(event.type)) {
    const name = readString(data.tool) ?? 'tool'
    const id = readString(data.id) ?? name
    const status = data.status === 'error' || (event.type === 'tool_call_end' && data.error) ? 'error' : data.status === 'ok' || event.type === 'tool_call_end' ? 'ok' : 'running'
    const tool: ToolStatus = { id, name, status, ...(status === 'error' ? { error: readString(data.error) ?? 'An agent tool failed.' } : {}) }
    const tools = state.tools.some((item) => item.id === id) ? state.tools.map((item) => item.id === id ? tool : item) : [...state.tools, tool]
    return { ...state, tools }
  }
  return state
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}
