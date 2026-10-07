import { describe, expect, test } from 'bun:test'

import { loadEnv } from '../env'
import { createRateLimitStores } from './index'

const base = {
  DATABASE_URL: 'postgresql://superuser:superpassword@localhost:54329/web_app_demo',
  JWT_SECRET: '12345678901234567890123456789012',
}

describe('createRateLimitStores', () => {
  test('counts in memory by default, so one process never pays a query for a budget it can count alone', async () => {
    const db = {
      execute: () => {
        throw new Error('the memory store must not touch the database')
      },
    }
    const store = createRateLimitStores(loadEnv(base), db as never)('auth')({ max: 1 })

    expect(await store.consume('203.0.113.10', 60, 1_000)).toEqual({ count: 1, resetAt: 61_000 })
  })

  test('routes every count through PostgreSQL once RATE_LIMIT_STORE selects the database', async () => {
    const queries: unknown[] = []
    const db = {
      execute: async (query: unknown) => {
        queries.push(query)
        return { rows: [{ count: 7 }] }
      },
    }
    const env = loadEnv({ ...base, RATE_LIMIT_STORE: 'database' })
    const store = createRateLimitStores(env, db as never)('auth')({ max: 1 })

    expect(await store.consume('203.0.113.10', 60, 1_000)).toEqual({ count: 7, resetAt: 60_000 })
    expect(queries).toHaveLength(1)
  })
})
