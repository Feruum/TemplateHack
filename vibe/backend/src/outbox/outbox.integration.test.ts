import { afterAll, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { count, eq, inArray, sql } from 'drizzle-orm'

import { closeDrizzleDb, createDrizzleDb } from '../db'
import { taskOutbox, users } from '../db-schema'
import type { BackendRuntime } from '../runtime'
import { drainTaskOutbox } from './drain'
import type { TaskHandlerRegistry } from './handlers'
import { enqueueTask } from './index'
import { claimTask, completeTask } from './store'

const databaseUrl = process.env.TEST_DATABASE_URL
const databaseUrlForTests = databaseUrl ?? 'postgresql://superuser:superpassword@localhost:54330/web_app_demo_test'
const maybeDescribe = databaseUrl ? describe : describe.skip

/**
 * The claim is the whole safety argument of this module, and it is made of database semantics a
 * fake client cannot have: two concurrent `UPDATE ... WHERE status = 'pending'` statements
 * serialising on a row lock. Everything here needs a real PostgreSQL.
 */
maybeDescribe('the task outbox against a real database', () => {
  const db = createDrizzleDb(databaseUrlForTests)
  const runtime = { db } as unknown as BackendRuntime
  const databaseNow = async () => {
    const result = await db.execute(sql`SELECT now() AS value`)
    return new Date(result.rows[0]!.value as string | Date)
  }

  beforeEach(async () => {
    await db.delete(taskOutbox)
  })

  afterAll(async () => {
    await closeDrizzleDb(db)
  })

  const registry = (run: () => Promise<void>): TaskHandlerRegistry => ({ 'test:work': { run } })

  test('two drains running at once split the work instead of duplicating it', async () => {
    // The test that would have caught it if dropping the advisory lock were wrong.
    const seeded = 40
    const idle = registry(async () => undefined)
    for (let index = 0; index < seeded; index += 1) {
      const key = `concurrent-${index}`
      await enqueueTask(db, { type: 'test:work', dedupeKey: key, payload: { key }, scheduledFor: new Date(0) }, idle)
    }

    const ran: string[] = []
    const handlers: TaskHandlerRegistry = {
      'test:work': {
        run: async ({ payload }) => {
          ran.push((payload as { key: string }).key)
          // Long enough that the two passes genuinely overlap.
          await Bun.sleep(2)
        },
      },
    }

    const passNow = await databaseNow()
    const [left, right] = await Promise.all([
      drainTaskOutbox(runtime, { handlers, now: passNow }),
      drainTaskOutbox(runtime, { handlers, now: passNow }),
    ])

    expect(left.done + right.done).toBe(seeded)
    expect(ran).toHaveLength(seeded)
    expect(new Set(ran).size).toBe(seeded)
    const [done] = await db.select({ count: count() }).from(taskOutbox).where(eq(taskOutbox.status, 'done'))
    expect(done?.count).toBe(seeded)
  })

  test('enqueueing the same work twice yields one row', async () => {
    const handlers = registry(async () => undefined)
    const first = await enqueueTask(db, { type: 'test:work', dedupeKey: 'once', payload: { n: 1 } }, handlers)
    const second = await enqueueTask(db, { type: 'test:work', dedupeKey: 'once', payload: { n: 2 } }, handlers)

    expect(first).toMatchObject({ created: true })
    expect(second).toEqual({ created: false, id: first.id })
    const [total] = await db.select({ count: count() }).from(taskOutbox)
    expect(total?.count).toBe(1)
    // The first caller's payload wins; the second is a duplicate, not an update.
    const firstRow = await db.select({ payload: taskOutbox.payload }).from(taskOutbox).where(eq(taskOutbox.id, first.id)).limit(1)
    expect(firstRow[0]?.payload).toEqual({ n: 1 })
  })

  test('enqueueing a duplicate inside a transaction does not roll the caller back', async () => {
    // The reason insertTask uses createMany({ skipDuplicates }) rather than catching a unique
    // violation: in PostgreSQL a failed statement poisons the whole transaction, so the recovery
    // read would abort and take the caller's committed-looking business write with it. Callers
    // are told to enqueue inside their own transaction, so this path has to stay clean.
    const handlers = registry(async () => undefined)
    await enqueueTask(db, { type: 'test:work', dedupeKey: 'shared', payload: { n: 1 } }, handlers)

    const email = `tx-${crypto.randomUUID()}@example.com`
    await db.transaction(async (tx) => {
      await tx.insert(users).values({ email, passwordHash: 'hash' })
      const again = await enqueueTask(tx, { type: 'test:work', dedupeKey: 'shared', payload: { n: 2 } }, handlers)
      expect(again.created).toBe(false)
    })

    // Both survived: the duplicate was absorbed, the business write committed.
    expect(await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)).toHaveLength(1)
    expect(await db.select({ id: taskOutbox.id }).from(taskOutbox).where(eq(taskOutbox.dedupeKey, 'shared'))).toHaveLength(1)
    await db.delete(users).where(eq(users.email, email))
  })

  test('a write from a superseded lease changes nothing', async () => {
    const handlers = registry(async () => undefined)
    const { id } = await enqueueTask(db, { type: 'test:work', dedupeKey: 'fenced', payload: {}, scheduledFor: new Date(0) }, handlers)

    const mine = await claimTask(db, { id, now: await databaseNow() })
    expect(mine).not.toBeNull()

    // Someone else recovers the lease and finishes the work.
    await db.update(taskOutbox).set({ processingToken: null, status: 'pending' }).where(eq(taskOutbox.id, id))
    const theirs = await claimTask(db, { id, now: await databaseNow() })
    expect(theirs).not.toBeNull()

    const owned = await completeTask(db, {
      completion: { attempts: 1, kind: 'terminal', lastError: null, status: 'done' },
      id,
      now: await databaseNow(),
      processingToken: mine!,
    })

    expect(owned).toBe(false)
    const [row] = await db.select({ status: taskOutbox.status }).from(taskOutbox).where(eq(taskOutbox.id, id)).limit(1)
    expect(row?.status).toBe('processing')
  })

  test('claiming a row restarts its lease clock', async () => {
    // Everything about lease recovery rests on the update bumping `updated_at` during the claiming
    // If that ever stops - a raw-SQL rewrite or a driver update - every row that sat
    // pending longer than the lease becomes instantly recoverable while its runner is working,
    // and the same task runs twice with nothing failing.
    const handlers = registry(async () => undefined)
    const { id } = await enqueueTask(db, { type: 'test:work', dedupeKey: 'clock', payload: {}, scheduledFor: new Date(0) }, handlers)
    await db.execute(sql`UPDATE task_outbox SET updated_at = now() - interval '10 minutes' WHERE id = ${id}::uuid`)

    const [before] = await db.select({ updatedAt: taskOutbox.updatedAt }).from(taskOutbox).where(eq(taskOutbox.id, id)).limit(1)
    await claimTask(db, { id, now: await databaseNow() })
    const [after] = await db.select({ updatedAt: taskOutbox.updatedAt }).from(taskOutbox).where(eq(taskOutbox.id, id)).limit(1)

    expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime())
    expect(Date.now() - after!.updatedAt.getTime()).toBeLessThan(60_000)
  })

  test('a lease that went stale is handed back without spending an attempt', async () => {
    const handlers = registry(async () => undefined)
    const { id } = await enqueueTask(db, { type: 'test:work', dedupeKey: 'stale', payload: {}, scheduledFor: new Date(0) }, handlers)
    await db.update(taskOutbox).set({ attempts: 2, processingToken: crypto.randomUUID(), status: 'processing' })
      .where(eq(taskOutbox.id, id))
    // Backdate past the lease. `updatedAt` is the lease clock, so it has to be written raw.
    await db.execute(sql`UPDATE task_outbox SET updated_at = now() - interval '10 minutes' WHERE id = ${id}::uuid`)

    const metrics = await drainTaskOutbox(runtime, { handlers, now: await databaseNow() })

    expect(metrics.recoveredStale).toBe(1)
    const [row] = await db.select().from(taskOutbox).where(eq(taskOutbox.id, id)).limit(1)
    expect(row).toMatchObject({
      attempts: 3,
      status: 'done',
    })
  })

  test('a failing task backs off and is given up on after its last attempt', async () => {
    const failing: TaskHandlerRegistry = {
      'test:work': {
        maxAttempts: 2,
        run: async () => {
          throw new Error('provider unavailable')
        },
      },
    }
    const error = spyOn(console, 'error').mockImplementation(() => {})

    try {
      const { id } = await enqueueTask(db, { type: 'test:work', dedupeKey: 'failing', payload: {}, scheduledFor: new Date(0) }, failing)

      const first = await drainTaskOutbox(runtime, { handlers: failing, now: await databaseNow(), random: () => 0 })
      expect(first).toMatchObject({ transientFailed: 1 })

      const [retried] = await db.select().from(taskOutbox).where(eq(taskOutbox.id, id)).limit(1)
      expect(retried?.status).toBe('pending')
      expect(retried?.scheduledFor.getTime()).toBeGreaterThan(Date.now())
      expect(retried?.lastError).toBe('provider unavailable')

      // Jump the clock forward instead of waiting two minutes.
      const later = new Date(Date.now() + 10 * 60 * 1000)
      const second = await drainTaskOutbox(runtime, { handlers: failing, now: later })

      expect(second).toMatchObject({ terminalFailed: 1 })
      const [failed] = await db.select().from(taskOutbox).where(eq(taskOutbox.id, id)).limit(1)
      expect(failed).toMatchObject({
        attempts: 2,
        redactedAt: expect.any(Date),
        status: 'failed',
      })
      expect(error).toHaveBeenCalledWith(
        `Task test:work ${id} gave up after 2 attempts.`,
        expect.any(Error),
      )
    } finally {
      error.mockRestore()
    }
  })

  test('terminal rows keep their audit skeleton and lose their payload', async () => {
    const handlers = registry(async () => undefined)
    const { id } = await enqueueTask(
      db,
      { type: 'test:work', dedupeKey: 'redacted', payload: { email: 'someone@example.com' } },
      handlers,
    )

    await drainTaskOutbox(runtime, { handlers, now: await databaseNow() })

    const [row] = await db.select().from(taskOutbox).where(eq(taskOutbox.id, id)).limit(1)
    expect(row?.payload).toEqual({})
    expect(row?.redactedAt).not.toBeNull()
    // The skeleton that survives carries no address, only the derived dedupe key.
    expect(row?.dedupeKey).toBe('redacted')
    expect(row?.status).toBe('done')
  })

  test('retention deletes terminal rows past the cutoff and keeps the rest', async () => {
    const handlers = registry(async () => undefined)
    const old = await enqueueTask(db, { type: 'test:work', dedupeKey: 'old', payload: {} }, handlers)
    const recent = await enqueueTask(db, { type: 'test:work', dedupeKey: 'recent', payload: {} }, handlers)
    await db.update(taskOutbox).set({ processedAt: new Date(), redactedAt: new Date(), status: 'done' })
      .where(inArray(taskOutbox.id, [old.id, recent.id]))
    await db.execute(sql`UPDATE task_outbox SET processed_at = now() - interval '40 days' WHERE id = ${old.id}::uuid`)

    const metrics = await drainTaskOutbox(runtime, { handlers, now: await databaseNow(), retentionDays: 30 })

    expect(metrics.deleted).toBe(1)
    expect(await db.select({ id: taskOutbox.id }).from(taskOutbox).where(eq(taskOutbox.id, old.id))).toHaveLength(0)
    expect(await db.select({ id: taskOutbox.id }).from(taskOutbox).where(eq(taskOutbox.id, recent.id))).toHaveLength(1)
  })
})
