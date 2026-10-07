import { randomUUID } from 'node:crypto'
import { and, asc, count, eq, inArray, lt, lte, notInArray } from 'drizzle-orm'

import { taskOutbox } from '../db-schema'
import type { DbClient } from '../db'
import type { EnqueueTaskInput, EnqueueTaskResult } from './types'

export type OutboxDb = Pick<DbClient, 'insert' | 'select' | 'update' | 'delete'>

export const terminalStatuses = ['done', 'skipped', 'failed'] as const
const emptyPayload = {}

export async function insertTask(db: OutboxDb, input: EnqueueTaskInput): Promise<EnqueueTaskResult> {
  const created = await db.insert(taskOutbox).values({
    type: input.type,
    dedupeKey: input.dedupeKey,
    payload: input.payload as Record<string, unknown>,
    ...(input.scheduledFor ? { scheduledFor: input.scheduledFor } : {}),
  }).onConflictDoNothing({ target: [taskOutbox.type, taskOutbox.dedupeKey] }).returning({ id: taskOutbox.id })
  const [row] = await db.select({ id: taskOutbox.id }).from(taskOutbox).where(and(
    eq(taskOutbox.type, input.type),
    eq(taskOutbox.dedupeKey, input.dedupeKey),
  )).limit(1)
  if (!row) throw new Error('Could not read the queued task after insert')
  return { created: created.length === 1, id: row.id }
}

export async function recoverStaleLeases(
  db: OutboxDb,
  { leaseStaleMs, now }: { leaseStaleMs: number; now: Date },
) {
  const rows = await db.update(taskOutbox).set({
    processedAt: null,
    processingToken: null,
    scheduledFor: now,
    status: 'pending',
    updatedAt: now,
  }).where(and(
    eq(taskOutbox.status, 'processing'),
    lt(taskOutbox.updatedAt, new Date(now.getTime() - leaseStaleMs)),
  )).returning({ id: taskOutbox.id })
  return rows.length
}

function claimableCondition(now: Date, types: readonly string[]) {
  return and(eq(taskOutbox.status, 'pending'), lte(taskOutbox.scheduledFor, now), inArray(taskOutbox.type, [...types]))
}

export function findClaimableTasks(db: OutboxDb, { limit, now, types }: { limit: number; now: Date; types: readonly string[] }) {
  return db.select({
    attempts: taskOutbox.attempts,
    id: taskOutbox.id,
    payload: taskOutbox.payload,
    type: taskOutbox.type,
  }).from(taskOutbox)
    .where(claimableCondition(now, types))
    .orderBy(asc(taskOutbox.scheduledFor), asc(taskOutbox.id))
    .limit(limit)
}

export async function claimTask(db: OutboxDb, { id, now }: { id: string; now: Date }) {
  const processingToken = randomUUID()
  const rows = await db.update(taskOutbox).set({
    processingToken,
    status: 'processing',
    updatedAt: now,
  }).where(and(
    eq(taskOutbox.id, id),
    eq(taskOutbox.status, 'pending'),
    lte(taskOutbox.scheduledFor, now),
  )).returning({ id: taskOutbox.id })
  return rows.length === 1 ? processingToken : null
}

export type TaskCompletion =
  | { kind: 'terminal'; attempts: number; lastError: string | null; status: 'done' | 'skipped' | 'failed' }
  | { kind: 'retry'; attempts: number; lastError: string; scheduledFor: Date }

export async function completeTask(
  db: OutboxDb,
  { completion, id, now, processingToken }: { completion: TaskCompletion; id: string; now: Date; processingToken: string },
) {
  const data = completion.kind === 'terminal'
    ? {
        attempts: completion.attempts,
        lastError: completion.lastError,
        payload: emptyPayload,
        processedAt: now,
        processingToken: null,
        redactedAt: now,
        status: completion.status,
        updatedAt: now,
      }
    : {
        attempts: completion.attempts,
        lastError: completion.lastError,
        processedAt: null,
        processingToken: null,
        scheduledFor: completion.scheduledFor,
        status: 'pending' as const,
        updatedAt: now,
      }
  const rows = await db.update(taskOutbox).set(data).where(and(
    eq(taskOutbox.id, id),
    eq(taskOutbox.processingToken, processingToken),
    eq(taskOutbox.status, 'processing'),
  )).returning({ id: taskOutbox.id })
  return rows.length === 1
}

export async function deleteExpiredTasks(
  db: OutboxDb,
  { limit, now, retentionDays }: { limit: number; now: Date; retentionDays: number },
) {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000)
  const expired = await db.select({ id: taskOutbox.id }).from(taskOutbox)
    .where(and(inArray(taskOutbox.status, [...terminalStatuses]), lt(taskOutbox.processedAt, cutoff)))
    .orderBy(asc(taskOutbox.processedAt))
    .limit(limit)
  if (expired.length === 0) return 0
  const deleted = await db.delete(taskOutbox).where(inArray(taskOutbox.id, expired.map((row) => row.id)))
    .returning({ id: taskOutbox.id })
  return deleted.length
}

export async function countClaimableTasks(db: OutboxDb, { now, types }: { now: Date; types: readonly string[] }) {
  if (types.length === 0) return 0
  const [row] = await db.select({ count: count() }).from(taskOutbox).where(claimableCondition(now, types))
  return row.count
}

export async function summarizeBacklog(db: OutboxDb, { now, types }: { now: Date; types: readonly string[] }) {
  const [backlog, oldest, unhandled] = await Promise.all([
    countClaimableTasks(db, { now, types }),
    types.length === 0
      ? Promise.resolve([])
      : db.select({ scheduledFor: taskOutbox.scheduledFor }).from(taskOutbox)
        .where(claimableCondition(now, types))
        .orderBy(asc(taskOutbox.scheduledFor))
        .limit(1),
    db.select({ count: count() }).from(taskOutbox).where(and(
      eq(taskOutbox.status, 'pending'),
      lte(taskOutbox.scheduledFor, now),
      types.length ? notInArray(taskOutbox.type, [...types]) : undefined,
    )),
  ])
  const oldestPending = oldest[0]?.scheduledFor
  return {
    backlog,
    oldestPendingAgeSeconds: oldestPending
      ? Math.max(0, Math.floor((now.getTime() - oldestPending.getTime()) / 1000))
      : null,
    unhandled: unhandled[0].count,
  }
}
