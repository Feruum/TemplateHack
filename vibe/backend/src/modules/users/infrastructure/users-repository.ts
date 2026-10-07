import { ADMIN_USERS_MAX_PAGE } from '@web-app-demo/contracts'
import type {
  AdminUserSummary,
  AdminUsersQuery,
  UserRole,
} from '@web-app-demo/contracts'
import { and, count, desc, eq, gte, ilike, isNull, or } from 'drizzle-orm'

import { authSessions, passwordResetTokens, users } from '../../../db-schema'
import {
  acquireUserAuthenticationAuthorityLock,
  acquireUserRoleMutationLock,
  type DbClient,
} from '../../../db'
import type {
  AdminDashboardReader,
  AdminUsersReader,
  ProfileWriter,
  UserRoleUpdater,
} from '../application/ports'
import { UsersFailure } from '../domain/errors'

const userSummaryColumns = {
  id: users.id,
  email: users.email,
  displayName: users.displayName,
  role: users.role,
  createdAt: users.createdAt,
}

type UsersRepository = ProfileWriter & AdminDashboardReader & AdminUsersReader & UserRoleUpdater

export function createDrizzleUsersRepository(db: DbClient): UsersRepository {
  return {
    async updateProfile(userId, displayName) {
      const [user] = await db.update(users)
        .set({ displayName, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning(userSummaryColumns)
      if (!user) throw new Error('User not found')
      return user
    },

    async dashboard(createdAfter) {
      const [totalUsers, totalAdmins, newUsersLast7Days] = await Promise.all([
        db.select({ count: count() }).from(users),
        db.select({ count: count() }).from(users).where(eq(users.role, 'admin')),
        db.select({ count: count() }).from(users).where(gte(users.createdAt, createdAfter)),
      ])
      return {
        totalUsers: totalUsers[0].count,
        totalAdmins: totalAdmins[0].count,
        newUsersLast7Days: newUsersLast7Days[0].count,
      }
    },

    async listUsers({ page, pageSize, q }: AdminUsersQuery) {
      const where = q
        ? or(ilike(users.email, containsPattern(q)), ilike(users.displayName, containsPattern(q)))
        : undefined
      const [total, rows] = await Promise.all([
        db.select({ count: count() }).from(users).where(where),
        db.select(userSummaryColumns).from(users)
          .where(where)
          .orderBy(desc(users.createdAt), desc(users.id))
          .offset((page - 1) * pageSize)
          .limit(pageSize),
      ])
      return {
        items: rows.map(toAdminUserSummary),
        page,
        pageSize,
        total: total[0].count,
        hasNext: page < ADMIN_USERS_MAX_PAGE && page * pageSize < total[0].count,
      }
    },

    updateRole(input) {
      return db.transaction(async (tx) => {
        await acquireUserRoleMutationLock(tx)
        await acquireUserAuthenticationAuthorityLock(tx, input.targetUserId)

        const [actor] = await tx.select({ id: users.id, role: users.role }).from(users)
          .where(eq(users.id, input.actorUserId)).limit(1)
        if (actor?.role !== 'admin') {
          throw new UsersFailure('forbidden', 'Administrator access is required')
        }

        const [target] = await tx.select(userSummaryColumns).from(users)
          .where(eq(users.id, input.targetUserId)).limit(1)
        if (!target) throw new UsersFailure('not_found', 'User not found')
        if (target.role === input.role) return toAdminUserSummary(target)
        if (target.id === actor.id && input.role !== 'admin') {
          throw new UsersFailure('role_conflict', 'You cannot remove your own administrator role')
        }

        if (target.role === 'admin' && input.role === 'user') {
          const [admins] = await tx.select({ count: count() }).from(users).where(eq(users.role, 'admin'))
          if (admins.count <= 1) {
            throw new UsersFailure('role_conflict', 'At least one administrator must remain')
          }
        }

        const [updated] = await tx.update(users).set({ role: input.role, updatedAt: input.now })
          .where(eq(users.id, target.id))
          .returning(userSummaryColumns)
        await tx.update(authSessions).set({ revokedAt: input.now, updatedAt: input.now })
          .where(and(eq(authSessions.userId, target.id), isNull(authSessions.revokedAt)))
        await tx.update(passwordResetTokens).set({ usedAt: input.now })
          .where(and(eq(passwordResetTokens.userId, target.id), isNull(passwordResetTokens.usedAt)))
        return toAdminUserSummary(updated)
      })
    },
  }
}

function containsPattern(value: string) {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`
}

function toAdminUserSummary(user: {
  id: string
  email: string
  displayName: string | null
  role: UserRole
  createdAt: Date
}): AdminUserSummary {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  }
}
