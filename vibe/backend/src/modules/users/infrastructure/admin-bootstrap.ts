import { and, count, eq, isNotNull, isNull } from 'drizzle-orm'

import { authSessions, passwordResetTokens, users } from '../../../db-schema'
import {
  acquireUserAuthenticationAuthorityLock,
  type DbClient,
} from '../../../db'
import type { AdminSeedConfig } from '../domain/admin-seed-config'

export { parseAdminSeedConfig } from '../domain/admin-seed-config'

export async function bootstrapAdmin(db: DbClient, config: AdminSeedConfig) {
  const requestedPasswordHash = config.password === null
    ? undefined
    : await Bun.password.hash(config.password, { algorithm: 'argon2id' })
  const admin = await upsertAdmin(db, config, requestedPasswordHash)
  return { email: admin.email, locked: admin.passwordHash === null }
}

async function upsertAdmin(
  db: DbClient,
  config: AdminSeedConfig,
  requestedPasswordHash: string | undefined,
) {
  const [created] = await db.insert(users).values({
    email: config.email,
    displayName: 'Administrator',
    passwordHash: requestedPasswordHash ?? null,
    role: 'admin',
  }).onConflictDoNothing({ target: users.email }).returning({ email: users.email, passwordHash: users.passwordHash })
  if (created) return created

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, config.email)).limit(1)
  if (!existing) throw new Error('Administrator changed while the local seed was running')
  return updateExistingAdmin(db, existing.id, config, requestedPasswordHash)
}

async function updateExistingAdmin(
  db: DbClient,
  userId: string,
  config: AdminSeedConfig,
  requestedPasswordHash: string | undefined,
) {
  return db.transaction(async (tx) => {
    await acquireUserAuthenticationAuthorityLock(tx, userId)
    const [existing] = await tx.select({ id: users.id, passwordHash: users.passwordHash, role: users.role })
      .from(users).where(eq(users.id, userId)).limit(1)
    if (!existing) throw new Error('Administrator no longer exists')
    const passwordMatches = config.password !== null && existing.passwordHash !== null &&
      await matchesPassword(config.password, existing.passwordHash)
    const passwordChanges = config.password !== null && !passwordMatches
    const changesAuthority = existing.role !== 'admin' || passwordChanges
    if (!changesAuthority) return { email: config.email, passwordHash: existing.passwordHash }

    const now = new Date()
    const [updated] = await tx.update(users).set({
      role: 'admin',
      ...(passwordChanges ? { passwordHash: requestedPasswordHash! } : {}),
      updatedAt: now,
    }).where(eq(users.id, existing.id)).returning({ email: users.email, passwordHash: users.passwordHash })
    await tx.update(authSessions).set({ revokedAt: now, updatedAt: now })
      .where(and(eq(authSessions.userId, existing.id), isNull(authSessions.revokedAt)))
    await tx.update(passwordResetTokens).set({ usedAt: now })
      .where(and(eq(passwordResetTokens.userId, existing.id), isNull(passwordResetTokens.usedAt)))
    return updated
  })
}

async function matchesPassword(password: string, passwordHash: string) {
  try {
    return await Bun.password.verify(password, passwordHash)
  } catch {
    return false
  }
}

export async function assertLoginCapableAdmin(db: DbClient) {
  const [result] = await db.select({ count: count() }).from(users).where(and(
    eq(users.role, 'admin'),
    isNotNull(users.passwordHash),
  ))
  if (result.count === 0) {
    throw new Error('Deployment requires at least one administrator with a password credential')
  }
}
