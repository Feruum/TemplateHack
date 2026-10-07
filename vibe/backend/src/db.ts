import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import { schema } from './db-schema'

export function createDrizzleDb(connectionString: string) {
  const pool = new Pool({
    connectionString: normalizePgConnectionString(connectionString),
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  })
  return Object.assign(drizzle(pool, { schema }), { pool })
}

export type DbClient = ReturnType<typeof createDrizzleDb>

export const userAuthorityTransitionTransactionOptions = {
  timeout: 15_000,
} as const

export const userAuthenticationSessionTransactionOptions = {
  timeout: userAuthorityTransitionTransactionOptions.timeout + 5_000,
} as const

/** Upper bound used by scheduled jobs for observability; the transaction owns the lock lifetime. */
export const defaultJobLockTimeoutMs = 15 * 60 * 1000

/**
 * Runs a job only while holding a transaction-scoped Postgres advisory lock. PostgreSQL releases
 * the lock when the transaction closes, including when the process dies, so another local runner
 * can recover immediately after a crash.
 */
export async function runWithJobLock<Result>(
  db: Pick<DbClient, 'pool'>,
  jobName: string,
  job: () => Promise<Result>,
  { timeoutMs = defaultJobLockTimeoutMs }: { timeoutMs?: number } = {},
): Promise<{ ranHere: true; result: Result } | { ranHere: false }> {
  const client = await db.pool.connect()
  let released = false
  let transactionOpen = false
  let timeout: Timer | undefined

  const release = (destroy = false) => {
    if (released) return
    released = true
    client.release(destroy)
  }

  try {
    await client.query('BEGIN')
    transactionOpen = true
    const startedAt = Date.now()
    const lock = await client.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired',
      [`background-job:${jobName}`],
    )

    if (!lock.rows[0]?.acquired) {
      await client.query('ROLLBACK')
      transactionOpen = false
      release()
      return { ranHere: false }
    }

    let timedOut = false
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        timedOut = true
        const elapsedMs = Date.now() - startedAt
        const cause = new Error('The job lock transaction was closed after its timeout.')
        release(true)
        reject(new JobLockExpiredError(jobName, timeoutMs, elapsedMs, cause))
      }, timeoutMs)
    })

    try {
      const result = await Promise.race([job(), timeoutPromise])
      await client.query('COMMIT')
      transactionOpen = false
      release()
      return { ranHere: true, result }
    } catch (error) {
      if (!timedOut && transactionOpen) {
        try {
          await client.query('ROLLBACK')
        } finally {
          transactionOpen = false
          release()
        }
      }
      throw error
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
    }
  } catch (error) {
    if (transactionOpen && !released) {
      try {
        await client.query('ROLLBACK')
      } catch {
        // Destroying a connection that has already failed also releases its transaction lock.
        release(true)
      }
    }
    release()
    throw error
  }
}

export class JobLockExpiredError extends Error {
  constructor(
    readonly jobName: string,
    readonly timeoutMs: number,
    readonly elapsedMs: number,
    override readonly cause: unknown,
  ) {
    super(
      `Background job "${jobName}" ran for ${elapsedMs}ms, past its ${timeoutMs}ms lock, so the lock was released while the job was still working.`,
    )
    this.name = 'JobLockExpiredError'
  }
}

export function isJobLockExpiry(error: unknown): error is JobLockExpiredError {
  return error instanceof JobLockExpiredError
}

export function acquireUserRoleMutationLock(db: Pick<DbClient, 'execute'>) {
  return db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('user-role-mutations', 0))`)
}

export function acquireUserAuthenticationAuthorityLock(
  db: Pick<DbClient, 'execute'>,
  userId: string,
) {
  return db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`auth-authority:${userId}`}, 0))`)
}

export function acquireUserAvatarMutationLock(db: Pick<DbClient, 'execute'>, userId: string) {
  return db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`user-avatar:${userId}`}, 0))`)
}

export async function closeDrizzleDb(db: Pick<DbClient, 'pool'>) {
  await db.pool.end()
}

export function normalizePgConnectionString(connectionString: string) {
  const url = new URL(connectionString)
  url.searchParams.delete('schema')
  url.searchParams.delete('schema')
  const sslMode = url.searchParams.get('sslmode')
  const useLibpqCompat = url.searchParams.get('uselibpqcompat')

  if (sslMode === 'require' && useLibpqCompat === null) {
    url.searchParams.set('uselibpqcompat', 'true')
  }

  return url.toString()
}
