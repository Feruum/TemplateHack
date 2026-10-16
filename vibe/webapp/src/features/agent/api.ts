import {
  agentChatRequestSchema,
  agentDocumentSchema,
  agentDocumentsResponseSchema,
  agentModulesResponseSchema,
  agentMemoriesResponseSchema,
  agentMemoryInputSchema,
  agentMemorySchema,
  agentMemoryDeletedSchema,
  AGENT_DOCUMENT_MAX_BYTES,
  type AgentChatRequest,
} from '@web-app-demo/contracts'

import type { AuthenticatedTransport } from '@/platform/api'

export function getAgentModules(transport: AuthenticatedTransport, signal?: AbortSignal) {
  return transport.request('/api/agent/modules', agentModulesResponseSchema, { signal })
}

export function getAgentDocuments(transport: AuthenticatedTransport, signal?: AbortSignal) {
  return transport.request('/api/agent/documents', agentDocumentsResponseSchema, { signal })
}

export function getAgentMemories(transport: AuthenticatedTransport, signal?: AbortSignal) {
  return transport.request('/api/agent/memories', agentMemoriesResponseSchema, { signal })
}

export function createAgentMemory(transport: AuthenticatedTransport, content: string) {
  return transport.request('/api/agent/memories', agentMemorySchema, {
    method: 'POST',
    body: agentMemoryInputSchema.parse({ content }),
  })
}

export function deleteAgentMemory(transport: AuthenticatedTransport, id: string) {
  return transport.request(`/api/agent/memories/${encodeURIComponent(id)}`, agentMemoryDeletedSchema, { method: 'DELETE' })
}

export async function uploadAgentDocument(transport: AuthenticatedTransport, file: File) {
  if (!isSupportedDocument(file)) {
    throw new Error('Choose a PDF or TXT file no larger than 25 MiB.')
  }

  const form = new FormData()
  form.set('file', file, file.name)
  const response = await transport.requestRaw('/api/agent/documents', {
    method: 'POST',
    body: form,
  })
  return agentDocumentSchema.parse(await response.json())
}

export function isSupportedDocument(file: Pick<File, 'name' | 'size'>) {
  const extension = file.name.split('.').pop()?.toLowerCase()
  return ['pdf', 'txt'].includes(extension ?? '') && file.size <= AGENT_DOCUMENT_MAX_BYTES
}

export function streamAgentChat(
  transport: AuthenticatedTransport,
  input: AgentChatRequest,
  signal?: AbortSignal,
) {
  const payload = agentChatRequestSchema.parse(input)
  return transport.requestRaw('/api/agent/chat/stream', {
    method: 'POST',
    body: payload,
    signal,
    headers: { Accept: 'text/event-stream' },
  })
}
