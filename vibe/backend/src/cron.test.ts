import { expect, spyOn, test } from 'bun:test'

import {
  handleProviderJobInvocation,
  handleProviderJobRequest,
  runOneShotJob,
} from './cron'
import type { BackendRuntime } from './runtime'

function runtimeWithLock(acquired: boolean) {
  const calls = {
    closes: 0,
    jobs: 0,
    queries: [] as string[],
    releases: [] as boolean[],
  }
  const db = {
    execute: async () => {
      calls.jobs += 1
      return { rows: [{ '?column?': 1 }] }
    },
    pool: {
      connect: async () => ({
        query: async (query: string) => {
          calls.queries.push(query)
          return query.includes('pg_try_advisory_xact_lock')
            ? { rows: [{ acquired }] }
            : { rows: [] }
        },
        release: (destroy?: boolean) => {
          calls.releases.push(destroy ?? false)
        },
      }),
    },
  }
  const runtime = {
    close: async () => {
      calls.closes += 1
    },
    db,
  } as unknown as BackendRuntime

  return { calls, runtime }
}

test('the provider one-shot path runs the job inside an advisory-lock transaction', async () => {
  const { calls, runtime } = runtimeWithLock(true)
  const log = spyOn(console, 'log').mockImplementation(() => {})

  try {
    await runOneShotJob(runtime, 'db:ping', [
      { expression: '* * * * *', job: 'db:ping', timeoutMs: 42_000 },
    ])

    expect(calls).toEqual({
      closes: 0,
      jobs: 1,
      queries: [
        'BEGIN',
        'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired',
        'COMMIT',
      ],
      releases: [false],
    })
  } finally {
    log.mockRestore()
  }
})

test('the provider one-shot path skips work while another runner owns the lock', async () => {
  const { calls, runtime } = runtimeWithLock(false)
  const log = spyOn(console, 'log').mockImplementation(() => {})

  try {
    await runOneShotJob(runtime, 'db:ping')

    expect(calls.jobs).toBe(0)
    expect(calls.queries).toContain('ROLLBACK')
    expect(calls.releases).toEqual([false])
    expect(log).toHaveBeenCalledWith(
      'Scheduler skipped db:ping: its lock is held elsewhere.',
    )
  } finally {
    log.mockRestore()
  }
})

test('the reusable one-shot path rejects when a job fails', async () => {
  const runtime = {
    db: {
      pool: {
        connect: async () => {
          throw new Error('database is unreachable')
        },
      },
    },
  } as unknown as BackendRuntime

  await expect(runOneShotJob(runtime, 'db:ping')).rejects.toThrow(
    'database is unreachable',
  )
})

test('the provider HTTP path exposes success and closes its request runtime', async () => {
  const { calls, runtime } = runtimeWithLock(true)
  const log = spyOn(console, 'log').mockImplementation(() => {})

  try {
    const response = await handleProviderJobInvocation(
      'db:ping',
      () => runtime,
      [{ expression: '* * * * *', job: 'db:ping', timeoutMs: 42_000 }],
    )

    expect(response.status).toBe(204)
    expect(calls).toEqual({
      closes: 1,
      jobs: 1,
      queries: [
        'BEGIN',
        'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired',
        'COMMIT',
      ],
      releases: [false],
    })
  } finally {
    log.mockRestore()
  }
})

test('the provider HTTP path returns non-2xx when a job fails', async () => {
  let closes = 0
  const runtime = {
    close: async () => {
      closes += 1
    },
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
    const response = await handleProviderJobInvocation('db:ping', () => runtime)

    expect(response.status).toBe(503)
    expect(await response.text()).toBe('Background job failed')
    expect(closes).toBe(1)
    expect(error).toHaveBeenCalled()
  } finally {
    error.mockRestore()
  }
})

function providerRequest(method: string, path: string) {
  return new Request(`http://jobs.internal${path}`, { method })
}

test('the provider HTTP server runs the job once for the trigger POST to /', async () => {
  const { calls, runtime } = runtimeWithLock(true)
  let runtimesCreated = 0
  const log = spyOn(console, 'log').mockImplementation(() => {})

  try {
    const response = await handleProviderJobRequest(
      providerRequest('POST', '/'),
      'db:ping',
      () => {
        runtimesCreated += 1
        return runtime
      },
      [{ expression: '* * * * *', job: 'db:ping', timeoutMs: 42_000 }],
    )

    expect(response.status).toBe(204)
    expect(runtimesCreated).toBe(1)
    expect(calls).toEqual({
      closes: 1,
      jobs: 1,
      queries: [
        'BEGIN',
        'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired',
        'COMMIT',
      ],
      releases: [false],
    })
  } finally {
    log.mockRestore()
  }
})

test('the provider HTTP server answers 405 to a non-POST without running the job', async () => {
  const { calls, runtime } = runtimeWithLock(true)
  let runtimesCreated = 0

  const response = await handleProviderJobRequest(
    providerRequest('GET', '/'),
    'db:ping',
    () => {
      runtimesCreated += 1
      return runtime
    },
  )

  expect(response.status).toBe(405)
  expect(response.headers.get('allow')).toBe('POST')
  expect(runtimesCreated).toBe(0)
  expect(calls.jobs).toBe(0)
})

test('the provider HTTP server answers 404 off the root path without running the job', async () => {
  const { calls, runtime } = runtimeWithLock(true)
  let runtimesCreated = 0
  const createRuntime = () => {
    runtimesCreated += 1
    return runtime
  }

  const unknownPath = await handleProviderJobRequest(
    providerRequest('POST', '/unknown'),
    'db:ping',
    createRuntime,
  )
  const strayProbe = await handleProviderJobRequest(
    providerRequest('GET', '/favicon.ico'),
    'db:ping',
    createRuntime,
  )

  expect(unknownPath.status).toBe(404)
  expect(strayProbe.status).toBe(404)
  expect(runtimesCreated).toBe(0)
  expect(calls.jobs).toBe(0)
})
