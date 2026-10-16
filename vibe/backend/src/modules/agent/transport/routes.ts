import {
  AGENT_DOCUMENT_MAX_BYTES,
  agentChatRequestSchema,
  agentMemoryInputSchema,
} from '@web-app-demo/contracts'
import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'

import type { AppEnv } from '../../../env'
import { AppError, errorResponse } from '../../../http/errors'
import type { AuthHttpEnv } from '../../auth'

const allowedExtensions = new Set(['pdf', 'txt'])

export function createAgentRoutes(options: {
  env: AppEnv
  fetchAgent?: typeof fetch
  requireAuth: MiddlewareHandler<AuthHttpEnv>
}) {
  const routes = new Hono<AuthHttpEnv>()
  const proxy = (path: string, init: RequestInit | undefined, userId: string) =>
    callAgent(options.env, path, init, userId, options.fetchAgent ?? fetch)

  routes.use('*', options.requireAuth)

  routes.get('/modules', async (c) => {
    const response = await proxy('/api/v1/modules', undefined, c.var.user.id)
    return relayJson(response)
  })

  routes.get('/memories', async (c) => {
    return relayJson(await proxy('/api/v1/memories', undefined, c.var.user.id))
  })

  routes.post('/memories', bodyLimit({ maxSize: 16 * 1024 }), async (c) => {
    const input = agentMemoryInputSchema.parse(await c.req.json())
    return relayJson(await proxy('/api/v1/memories', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }, c.var.user.id))
  })

  routes.delete('/memories/:memoryId', async (c) => {
    return relayJson(await proxy(`/api/v1/memories/${encodeURIComponent(c.req.param('memoryId'))}`, { method: 'DELETE' }, c.var.user.id))
  })

  routes.get('/documents', async (c) => {
    const response = await proxy('/admin/documents', undefined, c.var.user.id)
    return relayJson(response)
  })

  routes.get('/documents/:documentId', async (c) => {
    const response = await proxy(`/admin/documents/${encodeURIComponent(c.req.param('documentId'))}`, undefined, c.var.user.id)
    return relayJson(response)
  })

  routes.delete('/documents/:documentId', async (c) => {
    const response = await proxy(`/admin/documents/${encodeURIComponent(c.req.param('documentId'))}`, { method: 'DELETE' }, c.var.user.id)
    return relayJson(response)
  })

  routes.post('/documents', bodyLimit({
    maxSize: AGENT_DOCUMENT_MAX_BYTES + 256 * 1024,
    onError: (c) => c.json(errorResponse('PAYLOAD_TOO_LARGE', 'Document exceeds the 25 MiB upload limit'), 413),
  }), async (c) => {
    const declaredLength = Number(c.req.header('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > AGENT_DOCUMENT_MAX_BYTES + 256 * 1024) {
      throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'Document exceeds the 25 MiB upload limit')
    }

    let incoming: FormData
    try {
      incoming = await c.req.formData()
    } catch {
      throw new AppError(400, 'BAD_REQUEST', 'Send the document as multipart/form-data')
    }
    const file = incoming.get('file')
    if (!(file instanceof File)) {
      throw new AppError(400, 'BAD_REQUEST', 'A PDF or TXT file is required')
    }
    if (file.size > AGENT_DOCUMENT_MAX_BYTES) {
      throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'Document exceeds the 25 MiB upload limit')
    }
    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!allowedExtensions.has(extension)) {
      throw new AppError(400, 'BAD_REQUEST', 'Only PDF and TXT documents are supported')
    }

    const outgoing = new FormData()
    outgoing.set('file', file, file.name)
    const response = await proxy('/admin/ingest', { method: 'POST', body: outgoing }, c.var.user.id)
    return relayJson(response)
  })

  routes.post('/chat/stream', async (c) => {
    const input = agentChatRequestSchema.parse(await c.req.json())
    const response = await proxy('/api/v1/chat/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(input),
      signal: c.req.raw.signal,
    }, c.var.user.id)
    if (!response.ok) return await relayJson(response)
    return new Response(response.body, {
      status: response.status,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      },
    })
  })

  return routes
}

async function callAgent(
  env: AppEnv,
  path: string,
  init: RequestInit | undefined,
  userId: string,
  fetchAgent: typeof fetch,
) {
  const headers = new Headers(init?.headers)
  headers.set('X-API-Key', env.AGENT_API_KEY)
  headers.set('X-User-ID', userId)

  try {
    return await fetchAgent(`${env.AGENT_SERVICE_URL}${path}`, { ...init, headers })
  } catch (cause) {
    console.error('Agent service is unavailable.', cause)
    throw new AppError(503, 'AGENT_UNAVAILABLE', 'The agent service is unavailable')
  }
}

async function relayJson(response: Response) {
  if (!response.ok) {
    const details = await response.json().catch(() => undefined)
    const failure = isRecord(details) && 'error' in details
      ? details.error
      : isRecord(details) && 'detail' in details
        ? details.detail
        : details
    if (response.status === 413) {
      throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'Document exceeds the 25 MiB upload limit')
    }
    if (response.status === 404) throw new AppError(404, 'NOT_FOUND', 'Agent resource was not found')
    if (response.status === 400 || response.status === 422) {
      throw new AppError(400, 'BAD_REQUEST', 'The agent rejected the request', details)
    }
    if (response.status === 503 && isRecord(failure) && failure.code === 'LLM_NOT_CONFIGURED') {
      throw new AppError(503, 'LLM_NOT_CONFIGURED', String(failure.message ?? 'Configure a chat provider to enable agent responses'))
    }
    console.error(`Agent service returned HTTP ${response.status}`)
    throw new AppError(503, 'AGENT_UNAVAILABLE', 'The agent service could not complete the request')
  }
  return new Response(response.body, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isSupportedAgentDocument(filename: string) {
  return allowedExtensions.has(filename.split('.').pop()?.toLowerCase() ?? '')
}
