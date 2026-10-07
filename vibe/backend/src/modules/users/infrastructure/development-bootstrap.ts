import { and, eq, isNull } from 'drizzle-orm'

import { authSessions, passwordResetTokens, users } from '../../../db-schema'
import {
  acquireUserAuthenticationAuthorityLock,
  type DbClient,
} from '../../../db'
import { bootstrapAdmin } from './admin-bootstrap'

export type DevelopmentSeedAccounts = {
  admin: DevelopmentSeedCredentials
  user: DevelopmentSeedCredentials
}

type DevelopmentSeedCredentials = {
  email: string
  password: string
}

export async function bootstrapDevelopmentAccounts(db: DbClient, accounts: DevelopmentSeedAccounts) {
  const admin = await bootstrapAdmin(db, accounts.admin)
  const user = await bootstrapDevelopmentUser(db, accounts.user)
  return {
    admin: { email: admin.email, role: 'admin' as const },
    user: { email: user.email, id: user.id, role: 'user' as const },
  }
}

async function bootstrapDevelopmentUser(db: DbClient, credentials: DevelopmentSeedAccounts['user']) {
  const passwordHash = await Bun.password.hash(credentials.password, { algorithm: 'argon2id' })
  const [created] = await db.insert(users).values({
    displayName: 'Development User',
    email: credentials.email,
    passwordHash,
    role: 'user',
  }).onConflictDoNothing({ target: users.email }).returning({ email: users.email, id: users.id })
  if (created) return created

  const [existing] = await db.select({ id: users.id, passwordHash: users.passwordHash, role: users.role })
    .from(users).where(eq(users.email, credentials.email)).limit(1)
  if (!existing) throw new Error('Development user changed while the seed was running')
  if (existing.role !== 'user') {
    throw new Error(`Development user email ${credentials.email} belongs to an administrator`)
  }
  if (existing.passwordHash !== null && await matchesPassword(credentials.password, existing.passwordHash)) {
    return { email: credentials.email, id: existing.id }
  }

  return db.transaction(async (tx) => {
    await acquireUserAuthenticationAuthorityLock(tx, existing.id)
    const [current] = await tx.select({ passwordHash: users.passwordHash, role: users.role })
      .from(users).where(eq(users.id, existing.id)).limit(1)
    if (!current || current.role !== 'user') {
      throw new Error(`Development user email ${credentials.email} belongs to an administrator`)
    }
    if (current.passwordHash !== null && await matchesPassword(credentials.password, current.passwordHash)) {
      return { email: credentials.email, id: existing.id }
    }

    const now = new Date()
    const [updated] = await tx.update(users).set({ passwordHash, updatedAt: now })
      .where(eq(users.id, existing.id)).returning({ email: users.email, id: users.id })
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
