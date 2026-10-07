import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

test('PostgreSQL initialization script can be executed by the Linux container', () => {
  const source = readFileSync(new URL('./docker/create-agent-database.sh', import.meta.url), 'utf8')

  // Docker executes this bind-mounted file directly. A CRLF shebang becomes
  // /bin/sh\r, and CRLF shell lines also break when the entrypoint sources it.
  expect(source.startsWith('#!/bin/sh\n')).toBe(true)
  expect(source).not.toContain('\r')
})
