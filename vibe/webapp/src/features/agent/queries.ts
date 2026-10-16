import { queryOptions } from '@tanstack/react-query'

import { sessionQueryKeys } from '@/features/auth'
import type { AuthenticatedTransport } from '@/platform/api'
import { getAgentDocuments, getAgentMemories, getAgentModules } from './api'

export const agentQueryKeys = {
  all: [...sessionQueryKeys.all, 'agent'] as const,
  modules: (ownerId?: string) => [...agentQueryKeys.all, 'modules', ownerId] as const,
  documents: (ownerId?: string) => [...agentQueryKeys.all, 'documents', ownerId] as const,
  memories: (ownerId?: string) => [...agentQueryKeys.all, 'memories', ownerId] as const,
}

export function agentModulesQueryOptions(transport: AuthenticatedTransport, ownerId?: string) {
  return queryOptions({
    queryKey: agentQueryKeys.modules(ownerId),
    queryFn: ({ signal }) => getAgentModules(transport, signal),
    enabled: !!ownerId,
  })
}

export function agentDocumentsQueryOptions(transport: AuthenticatedTransport, ownerId?: string) {
  return queryOptions({
    queryKey: agentQueryKeys.documents(ownerId),
    queryFn: ({ signal }) => getAgentDocuments(transport, signal),
    enabled: !!ownerId,
  })
}

export function agentMemoriesQueryOptions(transport: AuthenticatedTransport, ownerId?: string) {
  return queryOptions({
    queryKey: agentQueryKeys.memories(ownerId),
    queryFn: ({ signal }) => getAgentMemories(transport, signal),
    enabled: !!ownerId,
  })
}
