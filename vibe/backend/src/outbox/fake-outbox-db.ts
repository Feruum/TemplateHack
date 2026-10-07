import type { BackendRuntime } from '../runtime'
import { getTableColumns } from 'drizzle-orm'
import { taskOutbox } from '../db-schema'

/**
 * An in-memory Drizzle-shaped stand-in for `task_outbox`, for tests about drain policy: what runs,
 * in what order, and what gets written. It supports only the predicates and query chains that
 * `store.ts` issues.
 *
 * It deliberately proves nothing about concurrency. That belongs in `outbox.integration.test.ts`
 * against a real database.
 */
export type FakeTaskRow = {
  id: string
  type: string
  dedupeKey: string
  payload: unknown
  status: 'pending' | 'processing' | 'done' | 'skipped' | 'failed'
  scheduledFor: Date
  attempts: number
  lastError: string | null
  processingToken: string | null
  processedAt: Date | null
  redactedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type FakeUpdate = {
  matchingRows: FakeTaskRow[]
  values: Record<string, unknown>
}

export function taskRow(overrides: Partial<FakeTaskRow> & Pick<FakeTaskRow, 'id' | 'type'>): FakeTaskRow {
  const now = new Date('2026-08-09T12:00:00.000Z')

  return {
    attempts: 0,
    createdAt: now,
    dedupeKey: overrides.id,
    lastError: null,
    payload: {},
    processedAt: null,
    processingToken: null,
    redactedAt: null,
    scheduledFor: now,
    status: 'pending',
    updatedAt: now,
    ...overrides,
  }
}

export function createFakeOutboxRuntime(
  rows: FakeTaskRow[],
  { insertedId = 'queued', beforeUpdate, beforeSelect, beforeInsert }: {
    insertedId?: string
    beforeUpdate?: (update: FakeUpdate) => void
    beforeSelect?: (selection?: Record<string, unknown>) => void
    beforeInsert?: (row: FakeTaskRow) => void
  } = {},
) {
  const columns = getOutboxColumns()
  const db = {
    select: (selection?: Record<string, unknown>) => createSelectBuilder(rows, selection, columns, beforeSelect),
    update: (table: unknown) => {
      assertOutboxTable(table)
      let values: Record<string, unknown> = {}
      return {
        set(next: Record<string, unknown>) {
          values = next
          return {
            where(condition: unknown) {
              const matchingRows = rows.filter((row) => matches(row, condition, columns))
              beforeUpdate?.({ matchingRows, values })
              return {
                returning(selection?: Record<string, unknown>) {
                  for (const row of matchingRows) Object.assign(row, values)
                  return Promise.resolve(matchingRows.map((row) => project(row, selection, columns)))
                },
              }
            },
          }
        },
      }
    },
    delete: (table: unknown) => {
      assertOutboxTable(table)
      return {
        where(condition: unknown) {
          const matchingRows = rows.filter((row) => matches(row, condition, columns))
          return {
            returning(selection?: Record<string, unknown>) {
              for (const row of matchingRows) rows.splice(rows.indexOf(row), 1)
              return Promise.resolve(matchingRows.map((row) => project(row, selection, columns)))
            },
          }
        },
      }
    },
    insert: (table: unknown) => {
      assertOutboxTable(table)
      return {
        values(values: Record<string, unknown>) {
          return {
            onConflictDoNothing() {
              return {
                returning(selection?: Record<string, unknown>) {
                  const duplicate = rows.some((row) => row.type === values.type && row.dedupeKey === values.dedupeKey)
                  if (duplicate) return Promise.resolve([])
                  const now = new Date()
                  const row = taskRow({
                    id: insertedId,
                    type: String(values.type),
                    dedupeKey: String(values.dedupeKey),
                    payload: values.payload,
                    ...(values.scheduledFor instanceof Date ? { scheduledFor: values.scheduledFor } : {}),
                    ...(values.id ? { id: String(values.id) } : {}),
                    createdAt: now,
                    updatedAt: now,
                  })
                  rows.push(row)
                  beforeInsert?.(row)
                  return Promise.resolve([project(row, selection, columns)])
                },
              }
            },
          }
        },
      }
    },
  }

  return { db } as unknown as BackendRuntime
}

function getOutboxColumns(): Map<object, keyof FakeTaskRow> {
  // Loading the schema lazily avoids a runtime dependency from the test helper's public types.
  // The table columns are the same objects used by the production query builders.
  return new Map(Object.entries(getTableColumns(taskOutbox)).map(([key, column]) => [column, key as keyof FakeTaskRow]))
}

function createSelectBuilder(
  rows: FakeTaskRow[],
  selection: Record<string, unknown> | undefined,
  columns: Map<object, keyof FakeTaskRow>,
  beforeSelect?: (selection?: Record<string, unknown>) => void,
) {
  let condition: unknown
  let sort: unknown[] = []
  let limit = Number.POSITIVE_INFINITY
  let source: unknown
  const builder = {
    from(table: unknown) {
      assertOutboxTable(table)
      source = table
      return builder
    },
    where(next: unknown) {
      condition = next
      return builder
    },
    orderBy(...next: unknown[]) {
      sort = next
      return builder
    },
    limit(next: number) {
      limit = next
      return builder
    },
    then<TResult1 = Record<string, unknown>[], TResult2 = never>(
      onfulfilled?: ((value: Record<string, unknown>[]) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      try {
        assertOutboxTable(source)
        beforeSelect?.(selection)
        const matchingRows = rows.filter((row) => matches(row, condition, columns))
        const orderedRows = sortRows(matchingRows, sort, columns).slice(0, limit)
        const result = selection && isCountProjection(selection)
          ? projectCount(selection, matchingRows.length)
          : orderedRows.map((row) => project(row, selection, columns))
        return Promise.resolve(result).then(onfulfilled, onrejected)
      } catch (error) {
        return Promise.reject(error).then(onfulfilled, onrejected)
      }
    },
  }
  return builder
}

function matches(row: FakeTaskRow, expression: unknown, columns: Map<object, keyof FakeTaskRow>): boolean {
  if (expression == null) return true
  const chunks = sqlChunks(expression)
  const inner = unwrapParentheses(chunks)
  if (inner.length === 1 && hasSqlChunks(inner[0])) return matches(row, inner[0], columns)
  const conjunction = splitAt(inner, ' and ')
  if (conjunction.length > 1) return conjunction.every((part) => matches(row, wrapSql(part), columns))
  const disjunction = splitAt(inner, ' or ')
  if (disjunction.length > 1) return disjunction.some((part) => matches(row, wrapSql(part), columns))

  const column = inner.find((chunk) => chunk && typeof chunk === 'object' && columns.has(chunk as object)) as object | undefined
  if (!column) throw new Error(`Unsupported fake outbox condition: ${describeChunks(inner)}`)
  const key = columns.get(column)!
  const operator = inner.find((chunk) => isStringChunk(chunk) && stringChunkText(chunk).trim().length > 0)
  const operatorText = operator ? stringChunkText(operator).trim() : ''
  const operand = inner.find((chunk) => isParam(chunk) || Array.isArray(chunk))
  const expected = Array.isArray(operand) ? operand.map(paramValue) : paramValue(operand)
  const actual = row[key]

  switch (operatorText) {
    case '=': return actual === expected
    case '<': return compare(actual, expected) < 0
    case '<=': return compare(actual, expected) <= 0
    case 'in': return Array.isArray(expected) && expected.includes(actual)
    case 'not in': return Array.isArray(expected) && !expected.includes(actual)
    default: throw new Error(`Unsupported fake outbox operator: ${operatorText}`)
  }
}

function sortRows(rows: FakeTaskRow[], order: unknown[], columns: Map<object, keyof FakeTaskRow>) {
  const orderings = order.map((item) => {
    const chunks = sqlChunks(item)
    const column = chunks.find((chunk) => chunk && typeof chunk === 'object' && columns.has(chunk as object)) as object | undefined
    if (!column) throw new Error(`Unsupported fake outbox ordering: ${describeChunks(chunks)}`)
    const direction = chunks.filter(isStringChunk).map(stringChunkText).join('').trim().toLowerCase().endsWith('desc')
      ? -1
      : 1
    return { direction, key: columns.get(column)! }
  })

  return [...rows].sort((left, right) => {
    for (const { direction, key } of orderings) {
      const a = left[key]
      const b = right[key]
      if (a == null || b == null || a === b) continue
      return compare(a, b) * direction
    }
    return 0
  })
}

function project(row: FakeTaskRow, selection: Record<string, unknown> | undefined, columns: Map<object, keyof FakeTaskRow>) {
  if (!selection) return row
  const result: Record<string, unknown> = {}
  for (const [name, expression] of Object.entries(selection)) {
    if (isCountExpression(expression)) {
      result[name] = 0
      continue
    }
    if (expression && typeof expression === 'object' && columns.has(expression)) {
      result[name] = row[columns.get(expression)!]
      continue
    }
    const chunks = sqlChunks(expression)
    const column = chunks.find((chunk) => chunk && typeof chunk === 'object' && columns.has(chunk as object)) as object | undefined
    if (!column) throw new Error(`Unsupported fake outbox projection: ${describeChunks(chunks)}`)
    result[name] = row[columns.get(column)!]
  }
  return result
}

function isCountProjection(selection: Record<string, unknown>) {
  return Object.values(selection).some(isCountExpression)
}

function isCountExpression(expression: unknown): boolean {
  return hasSqlChunks(expression)
    && expression.queryChunks.some((chunk) => isStringChunk(chunk) && stringChunkText(chunk).includes('count('))
}

function projectCount(selection: Record<string, unknown>, count: number) {
  return [Object.fromEntries(Object.entries(selection).map(([name]) => [name, count]))]
}

function hasSqlChunks(value: unknown): value is { queryChunks: unknown[] } {
  return !!value && typeof value === 'object' && Array.isArray((value as { queryChunks?: unknown }).queryChunks)
}

function sqlChunks(expression: unknown): unknown[] {
  if (!expression || typeof expression !== 'object' || !Array.isArray((expression as { queryChunks?: unknown }).queryChunks)) {
    throw new Error(`Expected a Drizzle SQL expression, received ${String(expression)}`)
  }
  return (expression as { queryChunks: unknown[] }).queryChunks
}

function unwrapParentheses(chunks: unknown[]) {
  let result = chunks
  while (result.length >= 3 && isStringChunk(result[0]) && isStringChunk(result[result.length - 1])
    && stringChunkText(result[0]).trim() === '(' && stringChunkText(result[result.length - 1]).trim() === ')') {
    result = result.slice(1, -1)
  }
  return result
}

function splitAt(chunks: unknown[], separator: string) {
  const parts: unknown[][] = []
  let part: unknown[] = []
  for (const chunk of chunks) {
    if (isStringChunk(chunk) && stringChunkText(chunk) === separator) {
      parts.push(part)
      part = []
    } else {
      part.push(chunk)
    }
  }
  if (parts.length === 0) return [chunks]
  parts.push(part)
  return parts
}

function wrapSql(queryChunks: unknown[]) {
  return { queryChunks }
}

function isStringChunk(value: unknown): value is { value: string[] } {
  return !!value && typeof value === 'object' && (value as { constructor?: { name?: string } }).constructor?.name === 'StringChunk'
}

function stringChunkText(value: unknown) {
  return isStringChunk(value) ? value.value.join('') : ''
}

function isParam(value: unknown): value is { value: unknown } {
  return !!value && typeof value === 'object' && (value as { constructor?: { name?: string } }).constructor?.name === 'Param'
}

function paramValue(value: unknown): unknown {
  return isParam(value) ? value.value : value
}

function compare(left: unknown, right: unknown): number {
  if (left instanceof Date && right instanceof Date) return left.getTime() - right.getTime()
  if (typeof left === 'number' && typeof right === 'number') return left - right
  if (typeof left === 'string' && typeof right === 'string') return left.localeCompare(right)
  throw new Error(`Cannot compare fake outbox values ${String(left)} and ${String(right)}`)
}

function assertOutboxTable(table: unknown): asserts table is object {
  if (table !== taskOutbox) throw new Error('The fake outbox database only supports the task_outbox table')
}

function describeChunks(chunks: unknown[]) {
  return chunks.map((chunk) => isStringChunk(chunk) ? stringChunkText(chunk) : isParam(chunk) ? '?' : String(chunk)).join('')
}
