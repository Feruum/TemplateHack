import { QueryClient } from '@tanstack/react-query'
import { expect, test } from 'bun:test'

import {
  agentDocumentsQueryOptions,
  agentMemoriesQueryOptions,
  agentModulesQueryOptions,
  agentQueryKeys,
} from '../src/features/agent/queries'
import { applyAuthenticatedSession, clearAuthenticatedSession } from '../src/features/auth/queries'
import type { AuthenticatedTransport, HttpRequestOptions } from '../src/platform/api'

test('sign-out removes private agent data and keeps public cache', async () => {
  const client = new QueryClient()
  const keys = [agentQueryKeys.modules('first'), agentQueryKeys.documents('first'), agentQueryKeys.memories('first')]
  for (const key of keys) client.setQueryData(key, { private: 'previous account' })
  client.setQueryData(['public', 'plans'], ['free'])

  await clearAuthenticatedSession(client, () => {})

  for (const key of keys) expect(client.getQueryData(key)).toBeUndefined()
  expect(client.getQueryData(['public', 'plans'])).toEqual(['free'])
  client.clear()
})

test('a replacement login removes the previous account agent cache', () => {
  const client = new QueryClient()
  const previousKey = agentQueryKeys.memories('previous')
  client.setQueryData(previousKey, { memories: ['private note'] })

  applyAuthenticatedSession(client, () => {}, {
    accessToken: 'synthetic-access-token',
    user: { id: 'next', email: 'next@example.com', displayName: null, role: 'user', createdAt: '2026-10-16T00:00:00.000Z' },
  })

  expect(client.getQueryData(previousKey)).toBeUndefined()
  expect(client.getQueryData(agentQueryKeys.memories('next'))).toBeUndefined()
  client.clear()
})

test('the next account cannot reuse another owner agent responses', () => {
  const client = new QueryClient()
  for (const key of [agentQueryKeys.modules, agentQueryKeys.documents, agentQueryKeys.memories]) {
    client.setQueryData(key('first'), { private: 'first account' })
    expect(client.getQueryData(key('second'))).toBeUndefined()
  }
  client.clear()
})

test('agent queries pass cancellation signals to the authenticated transport', async () => {
  const client = new QueryClient()
  const received: Array<{ path: string; signal?: AbortSignal }> = []
  const transport = {
    request: async (path: string, _schema: unknown, options?: HttpRequestOptions) => {
      received.push({ path, signal: options?.signal })
      return {} as never
    },
  } as unknown as AuthenticatedTransport

  await client.fetchQuery(agentModulesQueryOptions(transport, 'owner'))
  await client.fetchQuery(agentDocumentsQueryOptions(transport, 'owner'))
  await client.fetchQuery(agentMemoriesQueryOptions(transport, 'owner'))

  expect(received.map(({ path }) => path)).toEqual(['/api/agent/modules', '/api/agent/documents', '/api/agent/memories'])
  expect(received.every(({ signal }) => signal instanceof AbortSignal)).toBe(true)
  client.clear()
})

test('sign-out aborts a pending notes request before it can repopulate the cache', async () => {
  const client = new QueryClient()
  let requestSignal: AbortSignal | undefined
  let complete!: (value: never) => void
  const transport = {
    request: (_path: string, _schema: unknown, options?: HttpRequestOptions) => {
      requestSignal = options?.signal
      return new Promise<never>((resolve) => { complete = resolve })
    },
  } as unknown as AuthenticatedTransport
  const pending = client.fetchQuery(agentMemoriesQueryOptions(transport, 'owner')).catch(() => undefined)

  await clearAuthenticatedSession(client, () => {})
  complete({ memories: [] } as never)
  await pending

  expect(requestSignal?.aborted).toBe(true)
  expect(client.getQueryData(agentQueryKeys.memories('owner'))).toBeUndefined()
  client.clear()
})
