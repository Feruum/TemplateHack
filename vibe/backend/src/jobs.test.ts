import { describe, expect, spyOn, test } from 'bun:test'
import { getTableName } from 'drizzle-orm'

import { authSessions, passwordResetTokens, rateLimitBuckets, userAvatars } from './db-schema'
import { loadEnv } from './env'
import type { BackendRuntime } from './runtime'
import { backgroundJobNames, runBackgroundJob } from './jobs'

type RecordedQuery = {
  condition?: unknown
  limit?: number
  table: string
}

function drizzleValues(expression: unknown): unknown[] {
  if (!expression || typeof expression !== 'object') return []
  if (Array.isArray(expression)) return expression.flatMap(drizzleValues)

  const candidate = expression as { constructor?: { name?: string }; queryChunks?: unknown[]; value?: unknown }
  if (candidate.constructor?.name === 'Param') return [candidate.value]
  if (Array.isArray(candidate.queryChunks)) return candidate.queryChunks.flatMap(drizzleValues)
  return []
}

function recordingDatabase({
  avatarRows = [],
  deleteCounts = {},
}: {
  avatarRows?: { id: string; objectKey: string }[]
  deleteCounts?: Record<string, number>
} = {}) {
  const selects: RecordedQuery[] = []
  const deletes: RecordedQuery[] = []
  const deletedObjects: string[] = []
  const db = {
    select: () => {
      const query: RecordedQuery = { table: '' }
      const builder = {
        from(table: object) {
          query.table = getTableName(table as never)
          return builder
        },
        where(condition: unknown) {
          query.condition = condition
          return builder
        },
        limit(limit: number) {
          query.limit = limit
          return builder
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          selects.push(query)
          const rows = avatarRows.map(({ id, objectKey }) => ({ id, objectKey }))
          return Promise.resolve(rows).then(resolve, reject)
        },
      }
      return builder
    },
    delete(table: object) {
      const query: RecordedQuery = { table: getTableName(table as never) }
      return {
        where(condition: unknown) {
          query.condition = condition
          return {
            returning: async () => {
              deletes.push(query)
              const count = query.table === 'user_avatars'
                ? avatarRows.filter((row) => deletedObjects.includes(row.objectKey)).length
                : deleteCounts[query.table] ?? 0
              return Array.from({ length: count }, (_, index) => ({ id: `row-${index}` }))
            },
          }
        },
      }
    },
  }

  return { db, deletes, deletedObjects, selects }
}

describe('runBackgroundJob', () => {
  test('rejects an unknown job and names the ones that exist', async () => {
    const names = backgroundJobNames()
    const failure = await runBackgroundJob('missing', {} as BackendRuntime).catch((error: unknown) => error)

    expect(names.length).toBeGreaterThan(1)
    expect(String(failure)).toContain('Unknown job "missing"')
    for (const name of names) expect(String(failure)).toContain(name)
  })

  test('outbox:drain reaches the outbox and reports what it did', async () => {
    const { createFakeOutboxRuntime, taskRow } = await import('./outbox/fake-outbox-db')
    const drainRuntime = createFakeOutboxRuntime([taskRow({ id: 'a', type: 'shipped:later' })])
    const log = spyOn(console, 'log').mockImplementation(() => {})

    try {
      await runBackgroundJob('outbox:drain', {
        ...drainRuntime,
        env: loadEnv({
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/app',
          JWT_SECRET: '12345678901234567890123456789012',
        }),
      } as BackendRuntime)

      expect(log).toHaveBeenCalledWith(
        'Job outbox:drain completed.',
        expect.objectContaining({ backlog: 0, claimed: 0, unhandled: 1 }),
      )
    } finally {
      log.mockRestore()
    }
  })

  test('rejects Object.prototype keys instead of running nothing and reporting success', async () => {
    for (const inherited of ['constructor', 'toString', 'hasOwnProperty']) {
      await expect(runBackgroundJob(inherited, {} as BackendRuntime)).rejects.toThrow(
        `Unknown job "${inherited}"`,
      )
    }
  })

  describe('uploads:pending:cleanup', () => {
    const expired = [
      { id: 'upload-1', objectKey: 'avatars/2026/07/one' },
      { id: 'upload-2', objectKey: 'avatars/2026/07/two' },
    ]

    function createCleanupRuntime({ failingKey }: { failingKey?: string } = {}) {
      const calls = recordingDatabase({ avatarRows: expired })
      const runtime = {
        db: calls.db,
        privateStorage: {
          storage: {
            deleteObject: async (objectKey: string) => {
              if (objectKey === failingKey) throw new Error('storage unavailable')
              calls.deletedObjects.push(objectKey)
            },
          },
        },
      } as unknown as BackendRuntime

      return { calls, runtime }
    }

    test('collects pending uploads whose signed URL expired over an hour ago', async () => {
      const { calls, runtime } = createCleanupRuntime()
      const now = new Date('2026-08-09T12:00:00.000Z')

      await runBackgroundJob('uploads:pending:cleanup', runtime, now)

      expect(calls.selects).toHaveLength(1)
      expect(calls.selects[0]?.table).toBe('user_avatars')
      expect(calls.selects[0]?.limit).toBe(500)
      expect(drizzleValues(calls.selects[0]?.condition)).toContainEqual(new Date('2026-08-09T11:00:00.000Z'))
    })

    test('removes the stored object before the row that points at it', async () => {
      const { calls, runtime } = createCleanupRuntime()

      await runBackgroundJob('uploads:pending:cleanup', runtime, new Date())

      expect(calls.deletedObjects).toEqual(['avatars/2026/07/one', 'avatars/2026/07/two'])
      expect(calls.deletes).toHaveLength(1)
      expect(calls.deletes[0]?.table).toBe('user_avatars')
    })

    test('keeps the row when its object could not be deleted, so the next run retries', async () => {
      const { calls, runtime } = createCleanupRuntime({ failingKey: 'avatars/2026/07/one' })
      const error = spyOn(console, 'error').mockImplementation(() => {})

      try {
        await runBackgroundJob('uploads:pending:cleanup', runtime, new Date())

        expect(calls.deletedObjects).toEqual(['avatars/2026/07/two'])
        expect(calls.deletes).toHaveLength(1)
        expect(drizzleValues(calls.deletes[0]?.condition)).toContain('upload-2')
        expect(error).toHaveBeenCalledWith(
          'Job uploads:pending:cleanup could not delete avatars/2026/07/one:',
          expect.any(Error),
        )
      } finally {
        error.mockRestore()
      }
    })

    test('does not issue a delete when every object failed', async () => {
      const { calls, runtime } = createCleanupRuntime()
      const runtimeAllFailing = {
        ...runtime,
        privateStorage: { storage: { deleteObject: async () => { throw new Error('storage unavailable') } } },
      } as unknown as BackendRuntime
      const error = spyOn(console, 'error').mockImplementation(() => {})

      try {
        await runBackgroundJob('uploads:pending:cleanup', runtimeAllFailing, new Date())

        expect(calls.deletes).toEqual([])
        expect(error).toHaveBeenCalledTimes(2)
      } finally {
        error.mockRestore()
      }
    })
  })

  test('deletes expired and revoked auth sessions after the retention window', async () => {
    const calls = recordingDatabase({ deleteCounts: { auth_sessions: 2, password_reset_tokens: 3, rate_limit_buckets: 4 } })
    const runtime = {
      db: calls.db,
      env: { SESSION_ABSOLUTE_TTL_DAYS: 90, SESSION_RETENTION_DAYS: 7 },
    } as unknown as BackendRuntime
    const now = new Date('2026-04-08T12:00:00.000Z')

    await runBackgroundJob('auth:sessions:cleanup', runtime, now)

    const sessions = calls.deletes.find((query) => query.table === getTableName(authSessions))
    const resetTokens = calls.deletes.find((query) => query.table === getTableName(passwordResetTokens))
    const rateLimits = calls.deletes.find((query) => query.table === getTableName(rateLimitBuckets))
    expect(sessions).toBeDefined()
    expect(drizzleValues(sessions?.condition)).toContainEqual(new Date('2026-04-01T12:00:00.000Z'))
    expect(drizzleValues(sessions?.condition)).toContainEqual(new Date('2026-01-01T12:00:00.000Z'))
    expect(drizzleValues(resetTokens?.condition)).toContainEqual(now)
    expect(drizzleValues(rateLimits?.condition)).toContainEqual(now)
  })
})
