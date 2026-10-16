import type { Page, Route } from '@playwright/test'
import type { AgentChatRequest, AgentDocument, AgentMemory } from '@web-app-demo/contracts'
import { e2ePassword, expect, test, uniqueEmail } from '../helpers/test'

function response(text = 'The guide says 42.') {
  const events = [
    ['tool_status', { id: 'search-1', tool: 'search_knowledge', status: 'running' }],
    ['token', { content: text }],
    ['source', { filename: 'guide.pdf', page: 2, snippet: 'The measured value is 42.' }],
    ['tool_status', { id: 'search-1', tool: 'search_knowledge', status: 'ok' }],
    ['end', {}],
  ]
  return events.map(([type, data]) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`).join('')
}

async function openAgent(page: Page, chat: (route: Route) => Promise<void>) {
  let documents: AgentDocument[] = []
  let memories: AgentMemory[] = []
  await page.route('**/api/agent/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/chat/stream')) return chat(route)
    if (url.pathname.endsWith('/modules')) return route.fulfill({ json: { modules: [{ id: 'rag', name: 'RAG', description: 'Search private documents' }] } })
    if (url.pathname.endsWith('/documents')) {
      if (route.request().method() === 'POST') {
        expect(route.request().headers()['authorization']?.startsWith('Bearer ')).toBe(true)
        expect(route.request().postDataBuffer()?.includes(Buffer.from('notes.txt'))).toBe(true)
        const now = new Date().toISOString()
        const document: AgentDocument = { id: crypto.randomUUID(), job_id: crypto.randomUUID(), filename: 'notes.txt', status: 'COMPLETED', progress: 100, created_at: now, updated_at: now, content_hash: 'synthetic', error_code: null, error_message: null }
        documents = [document]
        return route.fulfill({ json: document })
      }
      return route.fulfill({ json: { documents } })
    }
    if (url.pathname.endsWith('/memories')) {
      expect(route.request().headers()['authorization']?.startsWith('Bearer ')).toBe(true)
      if (route.request().method() === 'POST') {
        const payload = route.request().postDataJSON()
        expect(Object.keys(payload)).toEqual(['content'])
        const note: AgentMemory = { id: crypto.randomUUID(), content: payload.content, created_at: new Date().toISOString() }
        memories = [...memories, note]
        return route.fulfill({ json: note })
      }
      return route.fulfill({ json: { memories } })
    }
    if (url.pathname.includes('/memories/') && route.request().method() === 'DELETE') {
      expect(route.request().headers()['authorization']?.startsWith('Bearer ')).toBe(true)
      const id = url.pathname.split('/').at(-1)
      expect(memories.some((note) => note.id === id)).toBe(true)
      memories = memories.filter((note) => note.id !== id)
      return route.fulfill({ json: { deleted: true } })
    }
    return route.abort()
  })
  await page.goto('/signup')
  await page.getByLabel('Email').fill(uniqueEmail('assistant-ui'))
  await page.getByLabel('Password', { exact: true }).fill(e2ePassword)
  await page.getByLabel('Confirm Password').fill(e2ePassword)
  await page.getByRole('button', { name: 'Create Account' }).click()
  await expect(page).toHaveURL(/\/app$/)
  const agentsLink = page.getByRole('link', { name: 'Agents', exact: true })
  if (!await agentsLink.isVisible()) await page.getByRole('button', { name: 'Toggle Sidebar', exact: true }).click()
  await agentsLink.click()
  await expect(page).toHaveURL(/\/app\/assistant$/)
  if (await page.getByRole('dialog').isVisible()) await page.keyboard.press('Escape')
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`RAG chat sends, retains citations, uploads, and manages memory at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    if (viewport.width === 390) await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const sent: AgentChatRequest[] = []
    await openAgent(page, async (route) => {
      expect(route.request().headers()['authorization']?.startsWith('Bearer ')).toBe(true)
      sent.push(route.request().postDataJSON())
      await route.fulfill({ contentType: 'text/event-stream', body: response() })
    })
    const input = page.getByLabel('Message', { exact: true })
    await input.fill('What is the measured value?')
    await input.press('Control+Enter')
    await expect(page.getByTestId('agent-assistant-message')).toContainText('The guide says 42.')
    await expect(page.getByTestId('agent-sources')).toContainText('guide.pdf · page 2')
    await expect(page.getByTestId('agent-tools')).toContainText('search_knowledge: ok')
    await expect(input).toHaveValue('')
    expect(sent[0]?.module_id).toBeUndefined()

    await page.getByRole('combobox', { name: 'Agent module' }).click()
    await page.getByRole('option', { name: 'RAG', exact: true }).click()
    await input.fill('Explain the evidence.')
    await page.getByTestId('agent-send').click()
    await expect(page.getByTestId('agent-assistant-message')).toHaveCount(2)
    await expect(page.getByTestId('agent-stop')).toHaveCount(0)
    expect(sent[1]?.thread_id).toBe(sent[0]?.thread_id)
    expect(sent[1]?.module_id).toBe('rag')
    expect(sent[1]?.messages.at(-1)?.content).toBe('Explain the evidence.')

    const fileInput = page.getByTestId('agent-document-input')
    await fileInput.setInputFiles({ name: 'bad.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('synthetic') })
    await expect(page.getByRole('alert')).toContainText('Choose a PDF or TXT file')
    await fileInput.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic test document') })
    await expect(page.getByTestId('agent-document')).toContainText('notes.txt')
    await expect(page.getByTestId('agent-document')).toContainText('completed')

    const draft = page.getByLabel('New memory note', { exact: true })
    await draft.fill('Synthetic preference: concise replies.')
    await page.getByTestId('agent-memory-save').click()
    await expect(page.getByTestId('agent-memory-note')).toContainText('Synthetic preference: concise replies.')
    await expect(draft).toHaveValue('')
    await page.reload()
    await expect(page.getByTestId('agent-memory-note')).toContainText('Synthetic preference: concise replies.')
    await page.getByTestId('agent-memory-delete').click()
    await expect(page.getByTestId('agent-memory-note')).toHaveCount(0)
    expect(errors).toEqual([])
    await page.evaluate(() => { window.scrollTo(0, 0); return new Promise<void>((resolve) => requestAnimationFrame(() => resolve())) })
    await page.screenshot({ path: testInfo.outputPath(`assistant-${viewport.width}.png`), fullPage: true })
  })
}

test('RAG chat displays provider errors, cancels a pending request, and accepts the next question', async ({ page }) => {
  let calls = 0
  let release: (() => void) | undefined
  await openAgent(page, async (route) => {
    calls++
    if (calls === 1) return route.fulfill({ contentType: 'text/event-stream', body: 'event: error\ndata: {"error":"LLM_NOT_CONFIGURED"}\n\nevent: end\ndata: {}\n\n' })
    if (calls === 2) {
      await new Promise<void>((resolve) => { release = resolve })
      await route.fulfill({ contentType: 'text/event-stream', body: response('Late response') }).catch(() => {})
      return
    }
    return route.fulfill({ contentType: 'text/event-stream', body: response('Recovered answer') })
  })
  const input = page.getByLabel('Message', { exact: true })
  await input.fill('First question')
  await page.getByTestId('agent-send').click()
  await expect(page.getByTestId('agent-error')).toContainText('LLM_NOT_CONFIGURED')
  await input.fill('Pending question')
  await page.getByTestId('agent-send').click()
  await expect.poll(() => calls).toBe(2)
  await page.getByTestId('agent-stop').click()
  await expect(input).toBeEnabled()
  release?.()
  await input.fill('Next question')
  await page.getByTestId('agent-send').click()
  await expect(page.getByTestId('agent-assistant-message').last()).toContainText('Recovered answer')
  await expect(page.getByTestId('agent-error')).toHaveCount(1)
})

test('RAG chat preserves the actionable message from an HTTP 503 provider error', async ({ page }) => {
  await openAgent(page, async (route) => route.fulfill({ status: 503, json: { error: { code: 'LLM_NOT_CONFIGURED', message: 'Configure a chat model before sending messages.' } } }))
  await page.getByLabel('Message', { exact: true }).fill('Question without a provider')
  await page.getByTestId('agent-send').click()
  await expect(page.getByTestId('agent-error')).toContainText('Configure a chat model before sending messages.')
  await expect(page.getByLabel('Message', { exact: true })).toBeEnabled()
})
