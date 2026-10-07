import { z } from 'zod'

export const agentModuleSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(240),
  })
  .strict()

export const agentModulesResponseSchema = z
  .object({
    modules: z.array(agentModuleSchema),
  })
  .strict()

export const agentChatMessageSchema = z
  .object({
    type: z.enum(['human', 'assistant']),
    content: z.string().trim().min(1).max(32000),
  })
  .strict()

export const agentChatRequestSchema = z
  .object({
    messages: z.array(agentChatMessageSchema).min(1).max(50),
    thread_id: z.string().trim().min(1).max(128).optional(),
    module_id: agentModuleSchema.shape.id.optional(),
  })
  .strict()

export const AGENT_DOCUMENT_MAX_BYTES = 25 * 1024 * 1024

export const agentDocumentStatusSchema = z.enum([
  'PENDING',
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'DELETING',
  'DELETED',
])

export const agentDocumentSchema = z
  .object({
    id: z.uuid(),
    job_id: z.uuid(),
    filename: z.string().min(1).max(512),
    status: agentDocumentStatusSchema,
    content_hash: z.string().nullable(),
    progress: z.number().int().min(0).max(100),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    started_at: z.string().datetime().nullable().optional(),
    completed_at: z.string().datetime().nullable().optional(),
    error_code: z.string().nullable(),
    error_message: z.string().nullable(),
  })
  .strict()

export const agentDocumentsResponseSchema = z
  .object({
    documents: z.array(agentDocumentSchema),
  })
  .strict()

export type AgentModule = z.infer<typeof agentModuleSchema>
export type AgentDocument = z.infer<typeof agentDocumentSchema>
export type AgentDocumentStatus = z.infer<typeof agentDocumentStatusSchema>
export type AgentChatRequest = z.infer<typeof agentChatRequestSchema>
