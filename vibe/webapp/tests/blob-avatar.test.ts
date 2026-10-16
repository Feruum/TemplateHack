import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Avatar, AvatarFallback, AvatarImage } from '../src/components/interface/avatar'
import { BlobAvatar } from '../src/components/identity/BlobAvatar'
import { UserMenu } from '../src/components/interface/user-menu'

function renderAvatar(seed: string, name = 'Sample account', photo?: string) {
  return renderToStaticMarkup(createElement(Avatar, { seed, name },
    photo ? createElement(AvatarImage, { src: photo, alt: '' }) : null,
    createElement(AvatarFallback, { 'data-testid': 'avatar-fallback' }, 'SA'),
  ))
}

function face(html: string) {
  return html.match(/<svg\b[\s\S]*?<\/svg>/)?.[0]
}

test('an account without a photo receives a locally generated Blobatar', () => {
  const html = renderAvatar('account-1')
  expect(html).toContain('data-blobatar="idle"')
  expect(html).toContain('data-testid="avatar-fallback"')
  expect(html).not.toContain('blobatar.dev/avatar')
})

test('account identity determines the face and a display-name change does not replace it', () => {
  const original = face(renderAvatar('account-1'))
  expect(original).toBeDefined()
  expect(face(renderAvatar('account-1', 'Renamed account'))).toBe(original)
  expect(face(renderAvatar('account-2'))).not.toBe(original)
})

test('an uploaded account photo takes precedence over its generated fallback', () => {
  const html = renderAvatar('account-1', 'Sample account', 'blob:synthetic-uploaded-photo')
  expect(html).toContain('src="blob:synthetic-uploaded-photo"')
  expect(html).not.toContain('data-blobatar=')
})

test('the thinking avatar is decorative and uses the explicit thinking pose', () => {
  const html = renderToStaticMarkup(createElement(BlobAvatar, { seed: 'templatehack:assistant', thinking: true }))
  expect(html).toContain('data-blobatar="thinking"')
  expect(html).toContain('aria-hidden="true"')
  expect(html).toContain('focusable="false"')
  expect(html).not.toContain('blobatar.dev/avatar')
})

test('the profile and account menu use the same face for the same account ID', () => {
  const menu = renderToStaticMarkup(createElement(UserMenu, {
    avatarSeed: 'account-1',
    user: { name: 'Sample account', email: 'sample@example.com' },
    showTheme: false,
  }))
  expect(face(menu)).toBe(face(renderAvatar('account-1')))
})

test('the account menu keeps the uploaded photo ahead of Blobatar', () => {
  const menu = renderToStaticMarkup(createElement(UserMenu, {
    avatarSeed: 'account-1',
    user: { name: 'Sample account', email: 'sample@example.com', avatarSrc: 'blob:synthetic-uploaded-photo' },
    showTheme: false,
  }))
  expect(menu).toContain('src="blob:synthetic-uploaded-photo"')
  expect(menu).not.toContain('data-blobatar=')
})
