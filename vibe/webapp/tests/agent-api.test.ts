import { expect, test } from 'bun:test'

import { AGENT_DOCUMENT_MAX_BYTES } from '@web-app-demo/contracts'
import { isSupportedDocument } from '../src/features/agent/api'

test('accepts PDF and TXT files up to the configured upload limit', () => {
  expect(isSupportedDocument({ name: 'handbook.PDF', size: AGENT_DOCUMENT_MAX_BYTES } as File)).toBe(true)
  expect(isSupportedDocument({ name: 'notes.txt', size: 10 } as File)).toBe(true)
})

test('rejects unsupported extensions and oversized files', () => {
  expect(isSupportedDocument({ name: 'slides.pptx', size: 10 } as File)).toBe(false)
  expect(isSupportedDocument({ name: 'notes.txt', size: AGENT_DOCUMENT_MAX_BYTES + 1 } as File)).toBe(false)
})
