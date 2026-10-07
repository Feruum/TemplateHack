import { describe, expect, test } from 'bun:test'

import { isJobLockExpiry, runWithJobLock, type DbClient } from './db'
import { normalizePgConnectionString } from './db'

describe('normalizePgConnectionString', () => {
  test('adds libpq compatibility for DigitalOcean sslmode=require URLs', () => {
    const result = normalizePgConnectionString(
      'postgresql://user:pass@db.example.com:25060/defaultdb?sslmode=require',
    )

    expect(result).toBe(
      'postgresql://user:pass@db.example.com:25060/defaultdb?sslmode=require&uselibpqcompat=true',
    )
  })

  test('preserves explicit libpq compatibility choice', () => {
    const result = normalizePgConnectionString(
      'postgresql://user:pass@db.example.com:25060/defaultdb?sslmode=require&uselibpqcompat=false',
    )

    expect(result).toBe(
      'postgresql://user:pass@db.example.com:25060/defaultdb?sslmode=require&uselibpqcompat=false',
    )
  })

  test('does not change non-TLS local URLs', () => {
    const result = normalizePgConnectionString(
      'postgresql://superuser:superpassword@localhost:54329/web_app_demo?schema=public',
    )

    expect(result).toBe('postgresql://superuser:superpassword@localhost:54329/web_app_demo')
  })
})

function createFakePool() {
  const locks = new Set<string>()
  const clients: Array<{ destroyed: boolean }> = []
  const pool = {
    async connect() {
      let heldLock: string | undefined
      let released = false
      const state = { destroyed: false }
      clients.push(state)
      return {
        async query<Row>(query: string, values: unknown[] = []) {
          if (query === 'BEGIN') return { rows: [] as Row[] }
          if (query.startsWith('SELECT pg_try_advisory_xact_lock')) {
            const lock = String(values[0])
            if (locks.has(lock)) return { rows: [{ acquired: false } as Row] }
            locks.add(lock)
            heldLock = lock
            return { rows: [{ acquired: true } as Row] }
          }
          if (query === 'COMMIT' || query === 'ROLLBACK') {
            if (heldLock) locks.delete(heldLock)
            heldLock = undefined
            return { rows: [] as Row[] }
          }
          throw new Error(`Unexpected query: ${query}`)
        },
        release(destroy = false) {
          if (released) return
          released = true
          state.destroyed = destroy
          if (heldLock) locks.delete(heldLock)
        },
      }
    },
  }
  return { pool, clients }
}

describe('runWithJobLock', () => {
  test('allows only one concurrent job and releases the lock when it finishes', async () => {
    const fake = createFakePool()
    const db = { pool: fake.pool } as unknown as Pick<DbClient, 'pool'>
    const started = Promise.withResolvers<void>()
    const finish = Promise.withResolvers<void>()
    let runs = 0

    const holder = runWithJobLock(db, 'job', async () => {
      runs += 1
      started.resolve()
      await finish.promise
      return 'first'
    })
    await started.promise
    const contender = await runWithJobLock(db, 'job', async () => {
      runs += 1
      return 'second'
    })

    finish.resolve()

    expect(contender).toEqual({ ranHere: false })
    expect(await holder).toEqual({ ranHere: true, result: 'first' })
    expect(runs).toBe(1)
    expect(fake.clients.every((client) => !client.destroyed)).toBe(true)
  })

  test('a transaction that never started is not a lock expiry, however long it waited', async () => {
    const db = {
      pool: {
        async connect() {
          await Bun.sleep(30)
          throw new Error('Pool connection failed before a lock was acquired')
        },
      },
    } as unknown as Pick<DbClient, 'pool'>

    const failure = await runWithJobLock(db, 'job', async () => 'never', {
      timeoutMs: 10,
    }).catch((error: unknown) => error)

    expect(isJobLockExpiry(failure)).toBe(false)
  })

  test('releases an overdue lock while the job body is still working', async () => {
    const fake = createFakePool()
    const db = { pool: fake.pool } as unknown as Pick<DbClient, 'pool'>
    const finish = Promise.withResolvers<void>()
    const overrun = runWithJobLock(db, 'job', async () => {
      await finish.promise
      return 'finished'
    }, { timeoutMs: 20 }).catch((error: unknown) => error)

    await Bun.sleep(35)
    const secondRun = await runWithJobLock(db, 'job', async () => 'second', { timeoutMs: 100 })
    finish.resolve()
    const failure = await overrun

    expect(secondRun).toEqual({ ranHere: true, result: 'second' })
    expect(isJobLockExpiry(failure)).toBe(true)
    expect(String(failure)).toContain('past its 20ms lock')
    expect(fake.clients[0]?.destroyed).toBe(true)
  })

  test('releases the lock if the job throws', async () => {
    const fake = createFakePool()
    const db = { pool: fake.pool } as unknown as Pick<DbClient, 'pool'>

    await expect(runWithJobLock(db, 'job', async () => {
      throw new Error('job exploded')
    })).rejects.toThrow('job exploded')

    expect(await runWithJobLock(db, 'job', async () => 'retry')).toEqual({
      ranHere: true,
      result: 'retry',
    })
  })
})
