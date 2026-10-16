import type { Page, TestInfo } from '@playwright/test'
import { e2eAdminEmail, e2eAdminPassword } from '../env'
import { e2ePassword, expect, test, uniqueEmail } from '../helpers/test'

async function accountMenu(page: Page) {
  const trigger = page.getByRole('button', { name: 'Open account menu', exact: true })
  if (!await trigger.isVisible()) await page.getByRole('button', { name: 'Toggle Sidebar', exact: true }).click()
  await trigger.click()
}

async function register(page: Page) {
  await page.goto('/signup')
  await page.getByLabel('Email', { exact: true }).fill(uniqueEmail('arc-interface'))
  await page.getByLabel('Password', { exact: true }).fill(e2ePassword)
  await page.getByLabel('Confirm Password', { exact: true }).fill(e2ePassword)
  await page.getByRole('button', { name: 'Create Account', exact: true }).click()
  await expect(page).toHaveURL(/\/app$/)
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())) })
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true })
}

for (const width of [1440, 390]) {
  test(`Arc interface preserves account, profile, settings, and admin routes at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    // RAG provider boundary only. Account/profile/admin calls use the real isolated backend.
    await page.route('**/api/agent/**', async (route) => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith('/modules')) return route.fulfill({ json: { modules: [{ id: 'rag', name: 'RAG', description: 'Search private documents' }] } })
      if (path.endsWith('/documents')) return route.fulfill({ json: { documents: [] } })
      if (path.endsWith('/memories')) return route.fulfill({ json: { memories: [] } })
      return route.abort()
    })
    await page.goto('/signup')
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
    await capture(page, testInfo, 'signup')
    await register(page)
    await capture(page, testInfo, 'workspace')
    await page.goto('/app/profile')
    await expect(page.getByLabel('Display name', { exact: true })).toBeVisible()
    await capture(page, testInfo, 'profile')
    await page.goto('/app/settings')
    const theme = page.getByRole('combobox', { name: 'Theme', exact: true })
    await theme.click()
    await page.getByRole('option', { name: 'Dark', exact: true }).click()
    await page.reload()
    await expect(theme).toContainText('Dark')
    await capture(page, testInfo, 'settings-dark')
    await page.goto('/app/assistant')
    await expect(page.getByTestId('agent-memory')).toBeVisible()
    await capture(page, testInfo, 'agent')
    await accountMenu(page)
    await page.getByRole('menuitem', { name: 'Log out', exact: true }).click()
    await expect(page).toHaveURL(/\/login/)
    await capture(page, testInfo, 'login')
    await page.goto('/forgot-password')
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
    await capture(page, testInfo, 'forgot-password')
    await page.goto('/login')
    await page.getByLabel('Email', { exact: true }).fill(e2eAdminEmail)
    await page.getByLabel('Password', { exact: true }).fill(e2eAdminPassword)
    await page.getByRole('button', { name: 'Login', exact: true }).click()
    await expect(page).toHaveURL(/\/admin$/)
    await capture(page, testInfo, 'admin')
    await page.goto('/admin/users')
    await expect(page.getByLabel('Search users', { exact: true })).toBeVisible()
    await capture(page, testInfo, 'admin-users')
    await page.goto('/admin/settings')
    await expect(page.getByRole('combobox', { name: 'Theme', exact: true })).toBeVisible()
    await capture(page, testInfo, 'admin-settings')
    expect(errors).toEqual([])
  })
}

for (const width of [390, 700]) {
  test(`Arc account menu stays keyboard-operable inside the mobile sidebar at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 })
    await register(page)
    await accountMenu(page)
    const settings = page.getByRole('menuitem', { name: 'Settings', exact: true })
    await settings.focus()
    await expect(settings).toBeFocused()
    // A sheet moving away from a stationary pointer can emit pointerout while exiting.
    // Deliver it during the real Escape event, without relying on animation timing.
    await settings.evaluate((row) => {
      const trigger = document.querySelector('button[aria-haspopup="menu"][aria-expanded="true"]')
      window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') row.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse', relatedTarget: trigger }))
      }, { capture: true, once: true })
    })
    await settings.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)
    const accountTrigger = page.getByRole('button', { name: 'Open account menu', exact: true })
    await expect(accountTrigger).toBeFocused()
    await expect(page.getByRole('dialog')).toBeVisible()
    await accountTrigger.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await accountMenu(page)
    await settings.focus()
    await settings.press('Escape')
    const profileLink = page.getByRole('link', { name: 'Profile', exact: true })
    await profileLink.focus()
    await expect(page.getByRole('menu')).toHaveCount(0)
    await expect(profileLink).toBeFocused()
    await profileLink.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await accountMenu(page)
    await settings.focus()
    await expect(settings).toBeFocused()
    await settings.press('Enter')
    await expect(page).toHaveURL(/\/app\/settings$/)
    await capture(page, testInfo, 'mobile-settings')
    await accountMenu(page)
    const logout = page.getByRole('menuitem', { name: 'Log out', exact: true })
    await logout.focus()
    await expect(logout).toBeFocused()
    await logout.press('Enter')
    await expect(page).toHaveURL(/\/login/)
  })
}
