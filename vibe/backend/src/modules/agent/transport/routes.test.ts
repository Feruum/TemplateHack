import { expect, spyOn, test } from 'bun:test'
import { Hono } from 'hono'

import { AGENT_DOCUMENT_MAX_BYTES } from '@web-app-demo/contracts'
import { loadEnv } from '../../../env'
import { handleError } from '../../../http/errors'
import { AuthFailure, createRequireAuth } from '../../auth'
import { createAgentRoutes } from './routes'

const env = loadEnv({
  DATABASE_URL: 'postgresql://superuser:superpassword@localhost:54329/web_app_demo',
  JWT_SECRET: '12345678901234567890123456789012',
  AGENT_SERVICE_URL: 'http://127.0.0.1:8001',
  AGENT_API_KEY: 'internal-test-key',
})

const user = {
  id: '0196f6f8-6600-7000-8000-000000000001',
  email: 'user@example.com',
  displayName: 'User',
  role: 'user' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  sessionId: 'session-1',
}

function createTestApp(fetchAgent: typeof fetch = fetch) {
  const requireAuth = createRequireAuth(async (accessToken) => {
    if (accessToken !== 'valid-session-token') {
      throw new AuthFailure('access_token_required', 'A valid session is required')
    }
    return user
  })
  const app = new Hono()
  app.route('/api/agent', createAgentRoutes({ env, fetchAgent, requireAuth }))
  app.onError(handleError)
  return app
}

test('chat proxy requires a session and forwards only the verified user identity', async () => {
  const calls: Array<{ url: RequestInfo | URL; init?: RequestInit }> = []
  const app = createTestApp(async (url, init) => {
    calls.push({ url, init })
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: token\ndata: {"content":"hello"}\n\n'))
          controller.close()
        },
      }),
      { headers: { 'content-type': 'text/event-stream' } },
    )
  })

  const unauthorized = await app.request('/api/agent/modules')
  expect(unauthorized.status).toBe(401)
  expect(calls).toHaveLength(0)

  const response = await app.request('/api/agent/chat/stream', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer valid-session-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [{ type: 'human', content: 'Explain this PDF' }],
      thread_id: 'thread-1',
      module_id: 'rag',
    }),
  })

  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toContain('text/event-stream')
  expect(await response.text()).toContain('"content":"hello"')

  const { url, init } = calls[0]!
  const headers = new Headers(init?.headers)
  expect(String(url)).toBe('http://127.0.0.1:8001/api/v1/chat/stream')
  expect(headers.get('X-API-Key')).toBe('internal-test-key')
  expect(headers.get('X-User-ID')).toBe(user.id)
  expect(JSON.parse(String(init?.body))).toMatchObject({ module_id: 'rag', thread_id: 'thread-1' })
})

test('unknown module IDs become a client error from the agent service', async () => {
  let calls = 0
  const app = createTestApp(async () => {
    calls += 1
    return Response.json({ detail: { code: 'UNKNOWN_MODULE' } }, { status: 422 })
  })
  const response = await app.request('/api/agent/chat/stream', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer valid-session-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [{ type: 'human', content: 'Hello' }],
      thread_id: 'thread-1',
      module_id: 'unknown-module',
    }),
  })

  expect(response.status).toBe(400)
  expect(calls).toBe(1)
  expect(await response.json()).toMatchObject({ error: { code: 'BAD_REQUEST' } })
})

test('agent service connection failures become a stable 503 response', async () => {
  const app = createTestApp(async () => {
    throw new Error('connection refused')
  })
  const errorLog = spyOn(console, 'error').mockImplementation(() => {})

  try {
    const response = await app.request('/api/agent/modules', {
      headers: { Authorization: 'Bearer valid-session-token' },
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: { code: 'AGENT_UNAVAILABLE' } })
  } finally {
    errorLog.mockRestore()
  }
})

test('an unconfigured LLM stays distinguishable from an unavailable agent service', async () => {
  const app = createTestApp(async () => Response.json({
    error: {
      code: 'LLM_NOT_CONFIGURED',
      message: 'Configure the chat provider to enable agent responses',
    },
  }, { status: 503 }))
  const response = await app.request('/api/agent/chat/stream', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer valid-session-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [{ type: 'human', content: 'Answer from my file' }],
      module_id: 'rag',
    }),
  })

  expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({
    error: { code: 'LLM_NOT_CONFIGURED' },
  })
})

test('document uploads reject unsupported files and files over the configured limit', async () => {
  let calls = 0
  const app = createTestApp(async () => {
    calls += 1
    return Response.json({})
  })
  const authorization = { Authorization: 'Bearer valid-session-token' }
  const unsupported = new FormData()
  unsupported.set('file', new File(['not a supported document'], 'notes.docx', { type: 'text/plain' }))

  const unsupportedResponse = await app.request('/api/agent/documents', {
    method: 'POST',
    headers: authorization,
    body: unsupported,
  })
  expect(unsupportedResponse.status).toBe(400)

  const oversized = new FormData()
  oversized.set('file', new File([new Uint8Array(AGENT_DOCUMENT_MAX_BYTES + 1)], 'large.txt', { type: 'text/plain' }))
  const oversizedResponse = await app.request('/api/agent/documents', {
    method: 'POST',
    headers: authorization,
    body: oversized,
  })
  expect(oversizedResponse.status).toBe(413)
  expect(calls).toBe(0)
})
