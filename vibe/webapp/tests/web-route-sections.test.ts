import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '../src/components/interface/empty'
import { SessionErrorSection, SessionLoadingSection } from '../src/components/WebRouteSections'

test('the Arc empty-state composition retains its title, description, and action', () => {
  const html = renderToStaticMarkup(createElement(Empty, null,
    createElement(EmptyHeader, null, createElement(EmptyTitle, null, 'No matching users'), createElement(EmptyDescription, null, 'Change the search query.')),
    createElement(EmptyContent, null, createElement('button', { type: 'button' }, 'Clear search')),
  ))
  expect(html).toContain('No matching users')
  expect(html).toContain('Change the search query.')
  expect(html).toContain('Clear search')
})

test('session loading preserves the page heading and explanation through the Arc adapter', () => {
  const html = renderToStaticMarkup(createElement(SessionLoadingSection))
  expect(html).toMatch(/<h1\b[^>]*>Loading workspace<\/h1>/)
  expect(html).toContain('Checking session...')
})

test('session recovery remains announced and exposes its retry control', () => {
  const html = renderToStaticMarkup(createElement(SessionErrorSection, { retry: async () => {} }))
  expect(html).toContain('role="alert"')
  expect(html).toContain('aria-live="assertive"')
  expect(html).toContain('Your session was not cleared.')
  expect(html).toContain('Try again')
})
