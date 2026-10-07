import { afterAll, describe, expect, test } from 'bun:test'

import { createDrizzleDb, isJobLockExpiry, runWithJobLock, type DbClient } from './db'

const databaseUrl = process.env.TEST_DATABASE_URL
const maybeDescribe = databaseUrl ? describe : describe.skip

/**
 * The scheduler's only defence against two instances running the same job is this lock, and its
 * behaviour lives entirely in Postgres. A session-scoped lock would leak across pooled connections
 * in production; the transaction-scoped lock is released when this connection is closed.
 */
maybeDescribe('runWithJobLock against a real database', () => {
  const clients: DbClient[] = []

  const newClient = () => {
    const client = createDrizzleDb(databaseUrl!)
    clients.push(client)
    return client
  }

  afterAll(async () => {
    await Promise.all(clients.map((client) => client.pool.end()))
  })

  test('only one of two concurrent processes runs the job', async () => {
    const first = newClient()
    const second = newClient()
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    let runs = 0

    const holder = runWithJobLock(first, 'test:contended', async () => {
      runs += 1
      started.resolve()
      await release.promise
    })

    // Only contend once the lock is genuinely held; otherwise the second call could win the race
    // and the test would pass for the wrong reason.
    await started.promise
    const contender = await runWithJobLock(second, 'test:contended', async () => {
      runs += 1
    })

    release.resolve()

    expect(contender).toEqual({ ranHere: false })
    expect(await holder).toEqual({ ranHere: true, result: undefined })
    expect(runs).toBe(1)
  })

  test('different jobs do not block each other', async () => {
    const first = newClient()
    const second = newClient()
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()

    const holder = runWithJobLock(first, 'test:one', async () => {
      started.resolve()
      await release.promise
    })

    await started.promise
    const other = await runWithJobLock(second, 'test:two', async () => 'ran')
    release.resolve()
    await holder

    expect(other).toEqual({ ranHere: true, result: 'ran' })
  })

  test('a job that outruns its timeout loses the lock and reports it as a lock expiry', async () => {
    const first = newClient()
    const second = newClient()
    let overrunFinished = false
    let releaseOverrun!: () => void
    let finishOverrun!: () => void
    const holdOverrun = new Promise<void>((resolve) => { releaseOverrun = resolve })
    const overrunFinishedSignal = new Promise<void>((resolve) => { finishOverrun = resolve })

    const overrun = runWithJobLock(
      first,
      'test:overrun',
      async () => {
        await holdOverrun
        overrunFinished = true
        finishOverrun()
      },
      { timeoutMs: 150 },
    ).catch((error: unknown) => error)

    // Wait past the timeout: the lock is gone even though the job body is still running, which is
    // exactly the duplicate-run window the scheduler warns about.
    await new Promise((resolve) => setTimeout(resolve, 300))
    const duplicate = await runWithJobLock(second, 'test:overrun', async () => 'ran anyway')

    expect(duplicate).toEqual({ ranHere: true, result: 'ran anyway' })
    expect(overrunFinished).toBe(false)
    releaseOverrun()
    await overrunFinishedSignal
    const failure = await overrun

    expect(overrunFinished).toBe(true)
    expect(isJobLockExpiry(failure)).toBe(true)
    expect(String(failure)).toContain('past its 150ms lock')
  })

  test('the same client can run the same job again afterwards', async () => {
    // A scheduler ticks the same job over and over on one client; every tick must run.
    const client = newClient()

    expect(await runWithJobLock(client, 'test:repeat', async () => 'first')).toEqual({
      ranHere: true,
      result: 'first',
    })
    expect(await runWithJobLock(client, 'test:repeat', async () => 'second')).toEqual({
      ranHere: true,
      result: 'second',
    })
  })

  test('the lock is released when the job throws', async () => {
    const first = newClient()
    const second = newClient()

    await expect(
      runWithJobLock(first, 'test:throwing', async () => {
        throw new Error('job exploded')
      }),
    ).rejects.toThrow('job exploded')

    expect(await runWithJobLock(second, 'test:throwing', async () => 'ran')).toEqual({
      ranHere: true,
      result: 'ran',
    })
  })
})
