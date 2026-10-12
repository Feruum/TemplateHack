import { build } from 'vite'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { injectPage } from './prerender.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const artifacts = resolve(root, '.artifacts')
await mkdir(artifacts, { recursive: true })
const serverOutput = await mkdtemp(resolve(artifacts, 'prerender-'))
try {
  await build({ root, build: { ssr: 'src/entry-server.tsx', outDir: serverOutput, copyPublicDir: false } })
  const { renderPage } = await import(pathToFileURL(resolve(serverOutput, 'entry-server.js')).href)
  const page = renderPage()
  await build({ root })
  const destination = resolve(root, 'dist/index.html')
  await writeFile(destination, injectPage(await readFile(destination, 'utf8'), page))
} finally {
  if (!serverOutput.startsWith(`${artifacts}${sep}`)) throw new Error('Prerender cleanup must remain inside local artifacts')
  await rm(serverOutput, { recursive: true, force: true })
}
