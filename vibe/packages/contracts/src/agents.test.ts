import { describe, expect, test } from 'bun:test'

import { agentChatRequestSchema, agentMemoryInputSchema, agentMemorySchema } from './agents'

describe('agent chat contract', () => {
  test('allows the backend to create a thread when the client omits thread_id', () => {
    expect(agentChatRequestSchema.parse({
      messages: [{ type: 'human', content: 'Answer from my files' }],
      module_id: 'rag',
    })).toEqual({
      messages: [{ type: 'human', content: 'Answer from my files' }],
      module_id: 'rag',
    })
  })

  test('accepts a caller-selected module and thread', () => {
    expect(agentChatRequestSchema.parse({
      messages: [{ type: 'human', content: 'Hello' }],
      thread_id: 'thread-1',
      module_id: 'rag',
    })).toMatchObject({ thread_id: 'thread-1', module_id: 'rag' })
  })

  test('rejects invalid module identifiers and thread identifiers', () => {
    expect(agentChatRequestSchema.safeParse({
      messages: [{ type: 'human', content: 'Hello' }],
      module_id: '../rag',
    }).success).toBe(false)
    expect(agentChatRequestSchema.safeParse({
      messages: [{ type: 'human', content: 'Hello' }],
      thread_id: '',
    }).success).toBe(false)
  })
})

describe('explicit agent memory contract', () => {
  test('trims note content and rejects blank, oversized, or forged-owner writes', () => {
    expect(agentMemoryInputSchema.parse({ content: '  Prefer Russian.  ' })).toEqual({ content: 'Prefer Russian.' })
    for (const input of [{ content: ' ' }, { content: 'x'.repeat(2001) }, { content: 'private', user_id: 'someone-else' }]) {
      expect(agentMemoryInputSchema.safeParse(input).success).toBe(false)
    }
  })

  test('accepts the Python response timestamp and never exposes an owner field', () => {
    const note = { id: '0196f6f8-6600-7000-8000-000000000001', content: 'Prefer Russian.', created_at: '2026-10-16T10:00:00+00:00' }
    expect(agentMemorySchema.parse(note)).toEqual(note)
    expect(agentMemorySchema.safeParse({ ...note, user_id: 'private-owner' }).success).toBe(false)
  })
})
