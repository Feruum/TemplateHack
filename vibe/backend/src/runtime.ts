import 'dotenv/config'

import { createBackgroundTasks, type BackgroundTasks } from './background-tasks'
import { closeDrizzleDb, createDrizzleDb, type DbClient } from './db'
import { createEmailDelivery, type EmailDelivery } from './email'
import { loadEnv, type AppEnv } from './env'
import { createPrivateStorage, type PrivateStorageRuntime } from './storage'

export type BackendRuntime = {
  backgroundTasks: BackgroundTasks
  /**
   * Built here rather than defaulted inside `createApp`, because the `outbox:drain` job runs
   * under `cron.ts` and never calls `createApp` - it would otherwise have no way to send.
   */
  emailDelivery: EmailDelivery
  env: AppEnv
  db: DbClient
  /**
   * The storage port plus the routes the filesystem driver needs mounted. Background jobs reach
   * the port through `privateStorage.storage`; `jobs.ts` must stay free of runtime imports.
   */
  privateStorage: PrivateStorageRuntime
  close: (timeoutMs?: number) => Promise<void>
}

export async function closeBackendRuntime(
  resources: {
    backgroundTasks: BackgroundTasks
    db: Pick<DbClient, 'pool'>
  },
  timeoutMs: number,
) {
  const drained = await resources.backgroundTasks.drain(timeoutMs)
  if (!drained) {
    console.error('Background task drain exceeded the shutdown grace period')
  }
  await closeDrizzleDb(resources.db)
}

export function createBackendRuntime(source: Record<string, string | undefined> = Bun.env): BackendRuntime {
  const env = loadEnv(source)
  const db = createDrizzleDb(env.DATABASE_URL)
  const backgroundTasks = createBackgroundTasks()
  const emailDelivery = createEmailDelivery(env)
  const privateStorage = createPrivateStorage(env)
  let closed = false

  return {
    backgroundTasks,
    emailDelivery,
    env,
    db,
    privateStorage,
    close: async (timeoutMs = env.SHUTDOWN_GRACE_SECONDS * 1000) => {
      if (closed) return
      closed = true
      await closeBackendRuntime({ backgroundTasks, db }, timeoutMs)
    },
  }
}
