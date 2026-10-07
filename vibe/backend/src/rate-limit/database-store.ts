import { sql } from 'drizzle-orm'

import type { DbClient } from '../db'
import type { RateLimitPolicy, RateLimitStore } from './port'

export type RateLimitDb = Pick<DbClient, 'execute'>

/** Counts across API processes through one atomic PostgreSQL upsert. */
export function createDatabaseRateLimitStore(db: RateLimitDb, policy: RateLimitPolicy): RateLimitStore {
  return {
    consume: async (key, windowSeconds, now) => {
      const windowMs = windowSeconds * 1000
      const windowStart = Math.floor(now / windowMs) * windowMs
      const resetAt = windowStart + windowMs
      const result = await db.execute(sql`
        INSERT INTO "rate_limit_buckets" ("policy", "key", "window_start", "count", "expires_at")
        VALUES (${policy}, ${key}, ${new Date(windowStart)}, 1, ${new Date(resetAt)})
        ON CONFLICT ("policy", "key", "window_start")
        DO UPDATE SET "count" = "rate_limit_buckets"."count" + 1
        RETURNING "count"
      `)
      const [{ count }] = result.rows as [{ count: number }]
      return { count, resetAt }
    },
  }
}
