import { afterAll, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { createApp } from '../../app'
import { closeDrizzleDb, createDrizzleDb } from '../../db'
import { loadEnv } from '../../env'
import { authSessions, users } from '../../db-schema'

const databaseUrl = process.env.TEST_DATABASE_URL
const integration = databaseUrl === undefined ? describe.skip : describe

integration('auth API integration', () => {
  if (databaseUrl === undefined) return

  const db = createDrizzleDb(databaseUrl)
  const app = createApp({
    db,
    env: loadEnv({
      DATABASE_URL: databaseUrl,
      JWT_SECRET: '12345678901234567890123456789012',
      CORS_ORIGINS: 'http://localhost:5173',
    }),
  })

  afterAll(async () => {
    await closeDrizzleDb(db)
  })

  test('registers, authenticates /me, logs in, and rejects the revoked session after logout', async () => {
    const email = `auth-integration-${crypto.randomUUID()}@example.com`
    const password = 'password123'

    try {
      const register = await app.request('/api/auth/token/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName: 'Integration User' }),
      })
      const registered = await register.json()

      expect(register.status).toBe(201)
      expect(registered.user.email).toBe(email)
      expect(registered.user.role).toBe('user')
      expect(registered.accessToken).toBeString()
      expect(registered.refreshToken).toBeString()

      const registeredMe = await app.request('/api/auth/me', {
        headers: { Authorization: `Bearer ${registered.accessToken}` },
      })
      expect(registeredMe.status).toBe(200)
      expect(await registeredMe.json()).toEqual({ user: registered.user })

      const login = await app.request('/api/auth/token/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const loggedIn = await login.json()

      expect(login.status).toBe(200)
      expect(loggedIn.user).toEqual(registered.user)
      expect(loggedIn.accessToken).toBeString()
      expect(loggedIn.refreshToken).toBeString()

      const loggedInMe = await app.request('/api/auth/me', {
        headers: { Authorization: `Bearer ${loggedIn.accessToken}` },
      })
      expect(loggedInMe.status).toBe(200)

      const logout = await app.request('/api/auth/token/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: loggedIn.refreshToken }),
      })
      expect(logout.status).toBe(204)

      const revokedMe = await app.request('/api/auth/me', {
        headers: { Authorization: `Bearer ${loggedIn.accessToken}` },
      })
      expect(revokedMe.status).toBe(401)

      const revokedRefresh = await app.request('/api/auth/token/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: loggedIn.refreshToken }),
      })
      expect(revokedRefresh.status).toBe(401)

      const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
      expect(user).toBeDefined()
      const sessions = await db.select({ revokedAt: authSessions.revokedAt })
        .from(authSessions)
        .where(eq(authSessions.userId, user!.id))
      expect(sessions).toHaveLength(2)
      expect(sessions.filter((session) => session.revokedAt !== null)).toHaveLength(1)
    } finally {
      await db.delete(users).where(eq(users.email, email))
    }
  }, 30_000)
})
