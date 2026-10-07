import { expect, spyOn, test } from 'bun:test'

import scheduleDefinitions from './job-schedules.json' with { type: 'json' }
import {
  runScheduledJob,
  schedules,
  startSchedules,
  type ScheduleEntry,
} from './scheduler'
import type { BackendRuntime } from './runtime'

function runtimeWithLock(options: { acquired: boolean }) {
  const calls = {
    transactions: 0,
    executions: 0,
    queries: [] as string[],
    releases: [] as boolean[],
  }

  const db = {
    execute: async () => {
      calls.executions += 1
      return { rows: [{ '?column?': 1 }] }
    },
    pool: {
      connect: async () => {
        calls.transactions += 1
        return {
          query: async (query: string) => {
            calls.queries.push(query)
            return query.includes('pg_try_advisory_xact_lock')
              ? { rows: [{ acquired: options.acquired }] }
              : { rows: [] }
          },
          release: (destroy?: boolean) => calls.releases.push(destroy ?? false),
        }
      },
    },
  }

  return { calls, runtime: { db } as unknown as BackendRuntime }
}

const pingEntry: ScheduleEntry = { expression: '* * * * *', job: 'db:ping' }

test('the production scheduler runs every required maintenance job in UTC', () => {
  expect(schedules).toEqual([
    { expression: '* * * * *', job: 'outbox:drain', timeoutMs: 240_000 },
    {
      expression: '15 * * * *',
      job: 'uploads:pending:cleanup',
      timeoutMs: 900_000,
    },
    {
      expression: '0 3 * * *',
      job: 'auth:sessions:cleanup',
      timeoutMs: 240_000,
    },
  ])
  expect(
    scheduleDefinitions.every(
      ({ lockTimeoutMs, yandexExecutionTimeoutSeconds }) =>
        lockTimeoutMs > yandexExecutionTimeoutSeconds * 1_000,
    ),
  ).toBe(true)
})

test('a scheduled job runs when this process wins the lock', async () => {
  const { calls, runtime } = runtimeWithLock({ acquired: true })
  const log = spyOn(console, 'log').mockImplementation(() => {})

  try {
    await runScheduledJob(runtime, pingEntry)

    expect(calls.transactions).toBe(1)
    expect(calls.queries).toEqual([
      'BEGIN',
      'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired',
      'COMMIT',
    ])
    expect(calls.executions).toBe(1)
    expect(calls.releases).toEqual([false])
    expect(log).toHaveBeenCalledWith('Job db:ping completed.')
  } finally {
    log.mockRestore()
  }
})

test('a scheduled job is skipped while another process holds the lock', async () => {
  // Two copies of the scheduler are normal during a rolling deploy; the second must do nothing
  // rather than run the same job twice.
  const { runtime } = runtimeWithLock({ acquired: false })
  const log = spyOn(console, 'log').mockImplementation(() => {})

  try {
    await runScheduledJob(runtime, pingEntry)

    expect(log).toHaveBeenCalledWith(
      'Scheduler skipped db:ping: its lock is held elsewhere.',
    )
    expect(log).not.toHaveBeenCalledWith('Job db:ping completed.')
  } finally {
    log.mockRestore()
  }
})

test('a failing job is reported and does not escape the scheduler', async () => {
  const runtime = {
    db: {
      pool: {
        connect: async () => {
          throw new Error('database is unreachable')
        },
      },
    },
  } as unknown as BackendRuntime
  const error = spyOn(console, 'error').mockImplementation(() => {})

  try {
    // No rejection: the next tick must still happen.
    await runScheduledJob(runtime, pingEntry)

    expect(error).toHaveBeenCalled()
    expect(String(error.mock.calls[0]?.[0])).toContain('db:ping')
  } finally {
    error.mockRestore()
  }
})

test('schedules default to UTC so a server timezone cannot move production runs', () => {
  const { runtime } = runtimeWithLock({ acquired: true })
  const { jobs } = startSchedules(runtime, [
    { expression: '0 3 * * *', job: 'noop' },
    { expression: '0 3 * * *', job: 'db:ping', timeZone: 'Europe/Moscow' },
  ])
  const [utc, explicit] = jobs.map((job) => job.cron)

  try {
    expect(utc?.options.timezone).toBe('UTC')
    expect(explicit?.options.timezone).toBe('Europe/Moscow')
    // Same wall-clock expression, different zones, so the next runs cannot coincide.
    expect(utc?.nextRun()?.getTime()).not.toBe(explicit?.nextRun()?.getTime())
  } finally {
    utc?.stop()
    explicit?.stop()
  }
})

test('a job that outruns its lock is reported as a duplicate-run risk, not a generic failure', async () => {
  // The pool connection is destroyed at the timeout so PostgreSQL releases the transaction lock;
  // the operator has to be told another instance may have started the same job.
  const runtime = {
    db: {
      execute: async () => {
        await Bun.sleep(30)
        return { rows: [{ '?column?': 1 }] }
      },
      pool: {
        connect: async () => ({
          query: async (query: string) => query.includes('pg_try_advisory_xact_lock')
            ? { rows: [{ acquired: true }] }
            : { rows: [] },
          release: (destroy?: boolean) => {
            if (destroy) calls.destroyed = true
          },
        }),
      },
    },
  } as unknown as BackendRuntime
  const calls = { destroyed: false }
  const error = spyOn(console, 'error').mockImplementation(() => {})
  const log = spyOn(console, 'log').mockImplementation(() => {})

  try {
    await runScheduledJob(runtime, { ...pingEntry, timeoutMs: 10 })

    expect(String(error.mock.calls[0]?.[0])).toContain('past its 10ms lock')
    expect(String(error.mock.calls[0]?.[0])).toContain(
      'Another instance may have started it too',
    )
    expect(calls.destroyed).toBe(true)
    await Bun.sleep(35)
  } finally {
    error.mockRestore()
    log.mockRestore()
  }
})

test('a database failure inside a job is not blamed on the lock', async () => {
  // An ordinary query failure is not a lock timeout. Telling the operator to raise the lock
  // timeout would send them after the wrong thing.
  const runtime = {
    db: {
      execute: async () => {
        throw new Error('inner query failed')
      },
      pool: {
        connect: async () => ({
          query: async (query: string) => query.includes('pg_try_advisory_xact_lock')
            ? { rows: [{ acquired: true }] }
            : { rows: [] },
          release: () => {},
        }),
      },
    },
  } as unknown as BackendRuntime
  const error = spyOn(console, 'error').mockImplementation(() => {})

  try {
    await runScheduledJob(runtime, { ...pingEntry, timeoutMs: 60_000 })

    expect(String(error.mock.calls[0]?.[0])).toBe(
      'Scheduler job db:ping failed.',
    )
  } finally {
    error.mockRestore()
  }
})

test('shutdown waits for a job that is already running', async () => {
  // Stopping the timers is not enough: cutting a running job off would leave it half-done with
  // neither a success nor a failure recorded anywhere.
  const release = Promise.withResolvers<void>()
  let finished = false
  const runtime = {
    db: {
      execute: async () => {
        await release.promise
        finished = true
        return { rows: [{ '?column?': 1 }] }
      },
      pool: {
        connect: async () => ({
          query: async (query: string) => query.includes('pg_try_advisory_xact_lock')
            ? { rows: [{ acquired: true }] }
            : { rows: [] },
          release: () => {},
        }),
      },
    },
  } as unknown as BackendRuntime
  const log = spyOn(console, 'log').mockImplementation(() => {})

  try {
    // Every second, so the tick lands inside the test rather than at the top of a minute.
    const handle = startSchedules(runtime, [
      { expression: '* * * * * *', job: 'db:ping' },
    ])
    await Bun.sleep(1_100)

    let drained = false
    const drain = handle.stop().then(() => {
      drained = true
    })

    await Bun.sleep(50)
    expect({ drained, finished }).toEqual({ drained: false, finished: false })

    release.resolve()
    await drain
    expect({ drained, finished }).toEqual({ drained: true, finished: true })
  } finally {
    log.mockRestore()
  }
})

test('one job can be scheduled more than once', () => {
  // A weekday/weekend split, or the same job in two timezones. croner throws on a repeated job
  // name, and that throw would happen at startup, before any signal handler exists - a supervised
  // process would then restart-loop with every schedule dead.
  const { runtime } = runtimeWithLock({ acquired: true })

  const handle = startSchedules(runtime, [
    { expression: '0 9 * * 1-5', job: 'auth:sessions:cleanup' },
    { expression: '0 12 * * 6,0', job: 'auth:sessions:cleanup' },
  ])

  try {
    expect(
      handle.jobs.map((job) => job.cron.nextRun()?.getTime()),
    ).not.toContain(undefined)
    expect(handle.jobs).toHaveLength(2)
  } finally {
    void handle.stop()
  }
})
