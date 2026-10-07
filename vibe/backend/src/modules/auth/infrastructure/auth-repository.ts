import { and, eq, gt, gte, isNull, or } from 'drizzle-orm'

import {
  authSessions,
  passwordResetTokens,
  users,
} from '../../../db-schema'
import {
  acquireUserAuthenticationAuthorityLock,
  type DbClient,
  userAuthenticationSessionTransactionOptions,
} from '../../../db'
import { enqueueTask } from '../../../outbox'
import type { AuthRepository } from '../application/ports'
import { AuthFailure } from '../domain/errors'

const authUserColumns = {
  id: users.id,
  email: users.email,
  passwordHash: users.passwordHash,
  displayName: users.displayName,
  role: users.role,
  createdAt: users.createdAt,
}

export function createDrizzleAuthRepository(db: DbClient): AuthRepository {
  return {
    async findUserByEmail(email) {
      const [user] = await db.select(authUserColumns).from(users).where(eq(users.email, email)).limit(1)
      return user ?? null
    },

    async createPasswordUserWithSession(input) {
      try {
        return await db.transaction(async (tx) => {
          const [user] = await tx.insert(users).values({
            email: input.user.email,
            passwordHash: input.user.passwordHash,
            displayName: input.user.displayName,
            role: 'user',
          }).returning(authUserColumns)
          const [session] = await tx.insert(authSessions).values({
            userId: user.id,
            refreshTokenHash: input.session.refreshTokenHash,
            refreshTokenFamilyHash: input.session.refreshTokenFamilyHash,
            expiresAt: input.session.expiresAt,
            userAgent: input.session.metadata.userAgent,
            ipAddress: input.session.metadata.ipAddress,
          }).returning({ id: authSessions.id })

          return { user, session }
        })
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new AuthFailure('email_already_exists', 'User with this email already exists')
        }
        throw error
      }
    },

    createSession(input) {
      return db.transaction(async (tx) => {
        await acquireUserAuthenticationAuthorityLock(tx, input.userId)
        const [user] = await tx.select(authUserColumns).from(users).where(eq(users.id, input.userId)).limit(1)
        if (!user || !(await input.authorizeUser(user))) return null

        const [session] = await tx.insert(authSessions).values({
          userId: user.id,
          refreshTokenHash: input.refreshTokenHash,
          refreshTokenFamilyHash: input.refreshTokenFamilyHash,
          expiresAt: input.expiresAt,
          userAgent: input.metadata.userAgent,
          ipAddress: input.metadata.ipAddress,
        }).returning({ id: authSessions.id })
        return { user, session }
      })
    },

    async findActiveRefreshSession(input) {
      const active = and(
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, input.now),
        gt(authSessions.createdAt, input.createdAfter),
      )
      const family = await findSessionWithUser(db, and(active, eq(authSessions.refreshTokenFamilyHash, input.refreshTokenFamilyHash)))
      if (family) {
        if (family.session.refreshTokenHash === input.refreshTokenHash) {
          return { ...family.session, user: family.user, credentialState: 'current' as const }
        }

        const withinGrace =
          family.session.previousRefreshTokenHash === input.refreshTokenHash &&
          family.session.refreshRotatedAt !== null &&
          family.session.refreshRotatedAt >= input.reuseGraceAfter
        return {
          ...family.session,
          user: family.user,
          credentialState: withinGrace ? ('previous_within_grace' as const) : ('reused' as const),
        }
      }

      const current = await findSessionWithUser(db, and(active, eq(authSessions.refreshTokenHash, input.refreshTokenHash)))
      if (current) return { ...current.session, user: current.user, credentialState: 'current' as const }

      const previous = await findSessionWithUser(db, and(active, eq(authSessions.previousRefreshTokenHash, input.refreshTokenHash)))
      if (!previous) return null
      const withinGrace =
        previous.session.refreshRotatedAt !== null &&
        previous.session.refreshRotatedAt >= input.reuseGraceAfter
      return {
        ...previous.session,
        user: previous.user,
        credentialState: withinGrace ? ('previous_within_grace' as const) : ('reused' as const),
      }
    },

    async rotateRefreshSession(input) {
      const updated = await db.update(authSessions).set({
        previousRefreshTokenHash: input.currentRefreshTokenHash,
        refreshTokenHash: input.nextRefreshTokenHash,
        refreshTokenFamilyHash: input.nextRefreshTokenFamilyHash,
        refreshRotatedAt: input.now,
        expiresAt: input.nextExpiresAt,
        userAgent: input.metadata.userAgent,
        ipAddress: input.metadata.ipAddress,
        updatedAt: input.now,
      }).where(and(
        eq(authSessions.id, input.currentSessionId),
        eq(authSessions.refreshTokenHash, input.currentRefreshTokenHash),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, input.now),
      )).returning({ id: authSessions.id })
      return updated.length === 1
    },

    async revokeSessionById(input) {
      const rows = await db.update(authSessions).set({ revokedAt: input.now, updatedAt: input.now })
        .where(and(eq(authSessions.id, input.sessionId), isNull(authSessions.revokedAt)))
        .returning({ id: authSessions.id })
      return rows.length === 1
    },

    async findActiveAccessSession(input) {
      const row = await findSessionWithUser(db, and(
        eq(authSessions.id, input.sessionId),
        eq(authSessions.userId, input.userId),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, input.now),
        gt(authSessions.createdAt, input.createdAfter),
      ))
      return row ? { id: row.session.id, user: row.user } : null
    },

    revokeSession(input) {
      return db.transaction(async (tx) => {
        const [session] = await tx.select({ id: authSessions.id, userId: authSessions.userId })
          .from(authSessions)
          .where(and(
            isNull(authSessions.revokedAt),
            or(
              eq(authSessions.refreshTokenHash, input.refreshTokenHash),
              eq(authSessions.previousRefreshTokenHash, input.refreshTokenHash),
              eq(authSessions.refreshTokenFamilyHash, input.refreshTokenFamilyHash),
            ),
          )).limit(1)
        if (!session) return null
        const rows = await tx.update(authSessions).set({ revokedAt: input.now, updatedAt: input.now })
          .where(and(eq(authSessions.id, session.id), isNull(authSessions.revokedAt)))
          .returning({ id: authSessions.id })
        return rows.length === 1 ? session.userId : null
      })
    },

    createPasswordResetToken(input) {
      return db.transaction(async (tx) => {
        await acquireUserAuthenticationAuthorityLock(tx, input.userId)
        const [recentToken] = await tx.select({ id: passwordResetTokens.id })
          .from(passwordResetTokens)
          .where(and(eq(passwordResetTokens.userId, input.userId), gte(passwordResetTokens.createdAt, input.createdAfter)))
          .limit(1)
        if (recentToken) return false

        await tx.update(passwordResetTokens).set({ usedAt: input.now })
          .where(and(eq(passwordResetTokens.userId, input.userId), isNull(passwordResetTokens.usedAt)))
        await tx.insert(passwordResetTokens).values({
          userId: input.userId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
        })
        return true
      })
    },

    async invalidatePasswordResetToken(input) {
      await db.update(passwordResetTokens).set({ usedAt: input.now })
        .where(and(eq(passwordResetTokens.tokenHash, input.tokenHash), isNull(passwordResetTokens.usedAt)))
    },

    async hasActivePasswordResetToken(input) {
      const [token] = await db.select({ id: passwordResetTokens.id })
        .from(passwordResetTokens)
        .where(and(
          eq(passwordResetTokens.tokenHash, input.tokenHash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, input.now),
        )).limit(1)
      return token !== undefined
    },

    completePasswordReset(input) {
      return db.transaction(async (tx) => {
        const [candidate] = await tx.select({ userId: passwordResetTokens.userId })
          .from(passwordResetTokens)
          .where(and(
            eq(passwordResetTokens.tokenHash, input.tokenHash),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.expiresAt, input.now),
          )).limit(1)
        if (!candidate) return null

        await acquireUserAuthenticationAuthorityLock(tx, candidate.userId)
        const [token] = await tx.select({ email: users.email })
          .from(passwordResetTokens)
          .innerJoin(users, eq(passwordResetTokens.userId, users.id))
          .where(and(
            eq(passwordResetTokens.tokenHash, input.tokenHash),
            eq(passwordResetTokens.userId, candidate.userId),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.expiresAt, input.now),
          )).limit(1)
        if (!token) return null

        await tx.update(users).set({ passwordHash: input.passwordHash, updatedAt: input.now })
          .where(eq(users.id, candidate.userId))
        await tx.update(passwordResetTokens).set({ usedAt: input.now })
          .where(and(eq(passwordResetTokens.userId, candidate.userId), isNull(passwordResetTokens.usedAt)))
        await tx.update(authSessions).set({ revokedAt: input.now, updatedAt: input.now })
          .where(and(eq(authSessions.userId, candidate.userId), isNull(authSessions.revokedAt)))

        await input.queueNotice(token.email, async (task) => {
          await enqueueTask(tx, task)
        })
        return { email: token.email }
      })
    },
  }
}

async function findSessionWithUser(
  db: Pick<DbClient, 'select'>,
  condition: ReturnType<typeof and>,
) {
  const [row] = await db.select({ session: authSessions, user: authUserColumns })
    .from(authSessions)
    .innerJoin(users, eq(authSessions.userId, users.id))
    .where(condition)
    .limit(1)
  return row ?? null
}

function isUniqueViolation(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === '23505'
}
