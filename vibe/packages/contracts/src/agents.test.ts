import { describe, expect, test } from 'bun:test'

import { agentChatRequestSchema } from './agents'

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
