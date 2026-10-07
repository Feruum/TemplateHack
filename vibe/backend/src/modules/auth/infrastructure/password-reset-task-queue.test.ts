import { describe, expect, test } from 'bun:test'

import { createFakeOutboxRuntime, taskRow, type FakeTaskRow } from '../../../outbox/fake-outbox-db'
import { createPasswordResetTaskQueue } from './password-reset-task-queue'

/**
 * Reuse the same Drizzle-shaped task_outbox fake as the drain tests. `park` adds a row the way a
 * retry or another task type would; `drain` models a pass finishing every due row.
 */
function recordingQueue({ pendingLimit = 50 }: { pendingLimit?: number } = {}) {
  const queued: FakeTaskRow[] = []
  const counted: string[][] = []
  const rows: FakeTaskRow[] = []
  let parked = 0
  const runtime = createFakeOutboxRuntime(rows, {
    beforeInsert: (row) => queued.push(row),
    beforeSelect: (selection) => {
      if (Object.hasOwn(selection ?? {}, 'count')) counted.push(Object.keys(selection ?? {}))
    },
  })

  return {
    counted,
    // Every row finished: what a pass does to a batch of addresses that have no account.
    drain: () => {
      rows.splice(0)
    },
    park: (row: Partial<FakeTaskRow>) => {
      rows.push(taskRow({ id: `parked-${parked++}`, type: 'auth:password-reset', ...row }))
    },
    queue: createPasswordResetTaskQueue(runtime.db, { pendingLimit }),
    queued,
  }
}

describe('the password reset task queue', () => {
  test('collapses a burst from one address, then lets the next window through', async () => {
    // Without the time bucket the key would be the address alone, so a user's second reset
    // request ever would collide with the first, already-finished row and silently queue
    // nothing - locking them out of resets permanently.
    const { queue, queued } = recordingQueue()
    const first = new Date('2026-08-09T12:00:00.000Z')

    await queue.enqueuePasswordReset({ email: 'user@example.com', now: first })
    await queue.enqueuePasswordReset({ email: 'user@example.com', now: new Date(first.getTime() + 30_000) })
    await queue.enqueuePasswordReset({ email: 'user@example.com', now: new Date(first.getTime() + 90_000) })

    const keys = queued.map((task) => task.dedupeKey)
    expect(keys).toHaveLength(2)
    expect(keys[1]).not.toBe(keys[0]!)
  })

  test('the key never carries the address, and never says whether it exists', async () => {
    const { queue, queued } = recordingQueue()
    const now = new Date('2026-08-09T12:00:00.000Z')

    await queue.enqueuePasswordReset({ email: 'User@Example.com ', now })

    const [task] = queued
    expect(task?.type).toBe('auth:password-reset')
    expect(task?.dedupeKey).not.toContain('example.com')
    expect(task?.dedupeKey).toMatch(/^[0-9a-f]{64}:\d+$/)
    // The payload keeps the address exactly as submitted; findUserByEmail is case-sensitive.
    expect(task?.payload).toEqual({ email: 'User@Example.com ' })
  })

  test('case and surrounding space do not split one address into two tasks', async () => {
    const { queue, queued } = recordingQueue()
    const now = new Date('2026-08-09T12:00:00.000Z')

    await queue.enqueuePasswordReset({ email: 'user@example.com', now })
    await queue.enqueuePasswordReset({ email: ' USER@Example.com ', now })

    expect(queued).toHaveLength(1)
  })

  test('stops writing once the waiting batch is full, and resumes when the drain empties it', async () => {
    // The request path admits any address, so what arrives here is bounded only by the auth rate
    // limit times the addresses an attacker holds, while the drain moves a fixed number of rows a
    // minute. Without a ceiling a flood of fresh addresses outruns the drain for as long as it
    // lasts, and every real reset queues behind it.
    const { drain, queue, queued } = recordingQueue({ pendingLimit: 2 })
    const now = new Date('2026-08-09T12:00:00.000Z')

    await queue.enqueuePasswordReset({ email: 'first@example.com', now })
    await queue.enqueuePasswordReset({ email: 'second@example.com', now })
    // Refused quietly: the caller answers 202 either way, so this must not throw.
    await expect(queue.enqueuePasswordReset({ email: 'third@example.com', now })).resolves.toBeUndefined()
    expect(queued.map((task) => task.payload)).toEqual([
      { email: 'first@example.com' },
      { email: 'second@example.com' },
    ])

    drain()
    await queue.enqueuePasswordReset({ email: 'third@example.com', now })
    expect(queued).toHaveLength(3)
  })

  test('only rows the next pass can claim count against the ceiling', async () => {
    // A failed delivery parks its row as pending with a due time minutes ahead. Counting those
    // would let a provider outage fill the ceiling with real resets in backoff and then drop
    // every new request for as long as the outage lasts. Other task types share the table and
    // the status, and have their own budget.
    // Enough of each kind to fill the ceiling on its own, so counting either would refuse.
    const { park, queue, queued } = recordingQueue({ pendingLimit: 2 })
    const now = new Date('2026-08-09T12:00:00.000Z')
    const retryAt = new Date(now.getTime() + 120_000)
    park({ scheduledFor: retryAt })
    park({ scheduledFor: retryAt })
    park({ type: 'auth:password-changed' })
    park({ type: 'auth:password-changed' })

    await queue.enqueuePasswordReset({ email: 'user@example.com', now })
    expect(queued).toHaveLength(1)

    // Once the retries are due they are claimable, so they fill the batch like any other row.
    const retriesDue = new Date(retryAt.getTime() + 60_000)
    await queue.enqueuePasswordReset({ email: 'other@example.com', now: retriesDue })
    expect(queued).toHaveLength(1)
  })

  test('the ceiling is read the same way for every address', async () => {
    // One query, keyed on nothing the caller submitted: the check happens before the address is
    // looked at, so neither its cost nor its outcome can say whether an account exists.
    const { counted, queue } = recordingQueue()
    const now = new Date('2026-08-09T12:00:00.000Z')

    await queue.enqueuePasswordReset({ email: 'user@example.com', now })
    await queue.enqueuePasswordReset({ email: 'nobody@example.org', now })

    expect(counted).toHaveLength(2)
    expect(counted[0]).toEqual(counted[1]!)
    expect(JSON.stringify(counted)).not.toMatch(/example\.(com|org)|user|nobody/)
  })
})
