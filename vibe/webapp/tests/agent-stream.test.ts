import { expect, test } from 'bun:test'

import { readAgentEventStream } from '../src/features/agent/stream'

test('reads event names and JSON payloads across partial SSE frames', async () => {
  const encoder = new TextEncoder()
  const chunks = [
    'event: token\r',
    '\ndata: {"content":"Hello"}\r\n\r\n',
    'event: tool_status\ndata: {"tool":"search_knowledge","status":"running"}\n\n',
    'event: source\ndata: {"filename":"guide.pdf","page":2}\n\n',
    'event: end\ndata: {}\n\n',
  ]
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  const events: Array<{ type: string; data: unknown }> = []

  await readAgentEventStream(new Response(body), (event) => events.push(event))

  expect(events).toEqual([
    { type: 'token', data: { content: 'Hello' } },
    { type: 'tool_status', data: { tool: 'search_knowledge', status: 'running' } },
    { type: 'source', data: { filename: 'guide.pdf', page: 2 } },
    { type: 'end', data: {} },
  ])
})

test('preserves a final SSE frame without a trailing blank line', async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('event: error\ndata: {"error":"provider down"}'))
      controller.close()
    },
  })
  const events: Array<{ type: string; data: unknown }> = []

  await readAgentEventStream(new Response(body), (event) => events.push(event))

  expect(events).toEqual([{ type: 'error', data: { error: 'provider down' } }])
})
