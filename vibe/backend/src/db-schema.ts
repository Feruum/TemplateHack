import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

const createdAt = () => timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
const updatedAt = () => timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow().$onUpdate(() => new Date())

export const userRole = pgEnum('user_role', ['user', 'admin'])
export const userAvatarState = pgEnum('user_avatar_state', ['pending', 'ready'])
export const taskOutboxStatus = pgEnum('task_outbox_status', [
  'pending',
  'processing',
  'done',
  'skipped',
  'failed',
])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`uuidv7()`),
  email: text('email').notNull().unique('users_email_key'),
  passwordHash: text('password_hash'),
  displayName: text('display_name'),
  role: userRole('role').notNull().default('user'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index('users_role_idx').on(table.role)])

export const userAvatars = pgTable('user_avatars', {
  id: uuid('id').primaryKey().default(sql`uuidv7()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  state: userAvatarState('state').notNull().default('pending'),
  objectKey: text('object_key').notNull(),
  contentType: text('content_type').notNull(),
  byteSize: integer('byte_size').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  readyAt: timestamp('ready_at', { withTimezone: true, mode: 'date' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex('user_avatars_object_key_key').on(table.objectKey),
  unique('user_avatars_user_id_state_key').on(table.userId, table.state),
  index('user_avatars_state_expires_at_idx').on(table.state, table.expiresAt),
])

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().default(sql`uuidv7()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique('password_reset_tokens_token_hash_key'),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
  createdAt: createdAt(),
}, (table) => [
  index('password_reset_tokens_user_id_created_at_idx').on(table.userId, table.createdAt),
  index('password_reset_tokens_expires_at_idx').on(table.expiresAt),
])

export const taskOutbox = pgTable('task_outbox', {
  id: uuid('id').primaryKey().default(sql`uuidv7()`),
  type: text('type').notNull(),
  dedupeKey: text('dedupe_key').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  status: taskOutboxStatus('status').notNull().default('pending'),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  processingToken: uuid('processing_token'),
  processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
  redactedAt: timestamp('redacted_at', { withTimezone: true, mode: 'date' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  unique('task_outbox_type_dedupe_key_key').on(table.type, table.dedupeKey),
  index('task_outbox_status_scheduled_for_idx').on(table.status, table.scheduledFor),
  index('task_outbox_status_processed_at_idx').on(table.status, table.processedAt),
])

export const authSessions = pgTable('auth_sessions', {
  id: uuid('id').primaryKey().default(sql`uuidv7()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  refreshTokenHash: text('refresh_token_hash').notNull().unique('auth_sessions_refresh_token_hash_key'),
  refreshTokenFamilyHash: text('refresh_token_family_hash').unique('auth_sessions_refresh_token_family_hash_key'),
  previousRefreshTokenHash: text('previous_refresh_token_hash').unique('auth_sessions_previous_refresh_token_hash_key'),
  refreshRotatedAt: timestamp('refresh_rotated_at', { withTimezone: true, mode: 'date' }),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
  userAgent: text('user_agent'),
  ipAddress: text('ip_address'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index('auth_sessions_user_id_idx').on(table.userId), index('auth_sessions_expires_at_idx').on(table.expiresAt)])

export const rateLimitBuckets = pgTable('rate_limit_buckets', {
  policy: text('policy').notNull(),
  key: text('key').notNull(),
  windowStart: timestamp('window_start', { withTimezone: true, mode: 'date' }).notNull(),
  count: integer('count').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (table) => [
  primaryKey({ name: 'rate_limit_buckets_pkey', columns: [table.policy, table.key, table.windowStart] }),
  index('rate_limit_buckets_expires_at_idx').on(table.expiresAt),
])

export const schema = {
  authSessions,
  passwordResetTokens,
  rateLimitBuckets,
  taskOutbox,
  userAvatars,
  users,
}
