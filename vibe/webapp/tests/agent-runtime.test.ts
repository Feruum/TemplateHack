import { expect, test } from 'bun:test'
import type { ChatModelRunOptions, ChatModelRunResult, ThreadMessage } from '@assistant-ui/react'
import type { AuthenticatedTransport } from '../src/platform/api'
import { createAgentModelAdapter, toAgentMessages } from '../src/features/agent/runtime'

function message(role: 'user' | 'assistant' | 'system', text: string): ThreadMessage {
  return { id: crypto.randomUUID(), role, content: [{ type: 'text', text }], createdAt: new Date() } as ThreadMessage
}

function options(messages = [message('user', 'Question')], abortSignal = new AbortController().signal) {
  return { messages, abortSignal, runConfig: {}, context: {} } as ChatModelRunOptions
}

function sse(events: Array<[string, unknown]>) {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const [type, data] of events) controller.enqueue(new TextEncoder().encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`))
      controller.close()
    },
  }))
}

function transport(response: Response, requests: unknown[] = []): AuthenticatedTransport {
  return {
    request() { throw new Error('Unexpected schema request') },
    async requestRaw(path, input) { requests.push({ path, ...input }); return response },
  }
}

async function results(response: Response) {
  const adapter = createAgentModelAdapter(transport(response), { threadId: 'stable-thread', moduleId: 'rag' })
  const updates: ChatModelRunResult[] = []
  for await (const update of adapter.run(options()) as AsyncGenerator<ChatModelRunResult>) updates.push(update)
  return updates
}

test('assistant runtime sends a validated request through the authenticated RAG proxy', async () => {
  const requests: unknown[] = []
  const signal = new AbortController().signal
  const adapter = createAgentModelAdapter(transport(sse([['end', {}]]), requests), { threadId: 'stable-thread', moduleId: 'rag' })
  for await (const _ of adapter.run(options([message('user', ' Question ')], signal)) as AsyncGenerator<ChatModelRunResult>) { void _ }
  expect(requests).toEqual([{ path: '/api/agent/chat/stream', method: 'POST', headers: { Accept: 'text/event-stream' }, signal, body: { thread_id: 'stable-thread', module_id: 'rag', messages: [{ type: 'human', content: 'Question' }] } }])
})

test('assistant runtime emits incremental text without losing sources or tool progress', async () => {
  const updates = await results(sse([
    ['token', { content: 'Hello' }],
    ['tool_status', { id: 'search-1', tool: 'search_knowledge', status: 'running' }],
    ['source', { filename: 'guide.pdf', page: 2, snippet: 'Evidence' }],
    ['source', { filename: 'guide.pdf', page: 2, snippet: 'Evidence' }],
    ['token', { content: ' world' }],
    ['tool_status', { id: 'search-1', tool: 'search_knowledge', status: 'ok' }],
    ['end', {}],
  ]))
  expect(updates[0]?.content).toEqual([{ type: 'text', text: 'Hello' }])
  expect(updates.at(-1)?.content).toEqual([{ type: 'text', text: 'Hello world' }])
  expect(updates.at(-1)?.metadata?.custom?.rag).toEqual({ sources: [{ filename: 'guide.pdf', page: 2, snippet: 'Evidence' }], tools: [{ id: 'search-1', name: 'search_knowledge', status: 'ok' }] })
  expect(updates.at(-1)?.status).toEqual({ type: 'complete', reason: 'stop' })
})

test('legacy nested SSE events retain citations and completed tool state', async () => {
  const updates = await results(sse([
    ['data', { type: 'tool_call_start', id: 'tool-1', tool: 'search' }],
    ['data', { type: 'sources', sources: [{ source: 'notes.txt', excerpt: 'A fact' }] }],
    ['data', { type: 'tool_call_end', id: 'tool-1', tool: 'search' }],
    ['end', {}],
  ]))
  expect(updates.at(-1)?.metadata?.custom?.rag).toEqual({ sources: [{ filename: 'notes.txt', snippet: 'A fact' }], tools: [{ id: 'tool-1', name: 'search', status: 'ok' }] })
})

test('unknown nested data events do not recurse or corrupt the response', async () => {
  const updates = await results(sse([['data', { type: 'data' }], ['token', { content: 'Safe' }], ['end', {}]]))
  expect(updates.at(-1)?.content).toEqual([{ type: 'text', text: 'Safe' }])
})

test('provider errors remain incomplete with their message and partial text', async () => {
  const updates = await results(sse([['token', { content: 'Partial' }], ['error', { error: 'LLM_NOT_CONFIGURED' }], ['end', {}]]))
  expect(updates.at(-1)?.content).toEqual([{ type: 'text', text: 'Partial' }])
  expect(updates.at(-1)?.status).toEqual({ type: 'incomplete', reason: 'error', error: 'LLM_NOT_CONFIGURED' })
})

test('a recoverable server tool error does not discard the later agent answer', async () => {
  const updates = await results(sse([
    ['tool_status', { id: 'search-1', tool: 'search_knowledge', status: 'error', error: 'Search unavailable' }],
    ['token', { content: 'I could not search the documents. Please try again.' }],
    ['end', {}],
  ]))
  expect(updates.at(-1)?.content).toEqual([{ type: 'text', text: 'I could not search the documents. Please try again.' }])
  expect(updates.at(-1)?.status).toEqual({ type: 'complete', reason: 'stop' })
  expect(updates.at(-1)?.metadata?.custom?.rag).toMatchObject({ tools: [{ status: 'error', error: 'Search unavailable' }] })
})

test('a stream that closes without an end event is reported as interrupted', async () => {
  await expect(results(sse([['token', { content: 'Partial' }]]))).rejects.toThrow('interrupted')
})

test('network failures propagate to assistant runtime error handling', async () => {
  const client: AuthenticatedTransport = { request() { throw new Error('unused') }, async requestRaw() { throw new Error('Agent unavailable') } }
  const adapter = createAgentModelAdapter(client, { threadId: 't' })
  const run = adapter.run(options()) as AsyncGenerator<ChatModelRunResult>
  await expect(run.next()).rejects.toThrow('Agent unavailable')
})

test('runtime history excludes system/empty messages and stays inside the API bound', () => {
  const history = [message('system', 'Private prompt'), message('assistant', ' '), ...Array.from({ length: 70 }, (_, index) => message('user', `q${index}`))]
  const actual = toAgentMessages(history)
  expect(actual).toHaveLength(49)
  expect(actual[0]).toEqual({ type: 'human', content: 'q21' })
  expect(actual.at(-1)).toEqual({ type: 'human', content: 'q69' })
})
