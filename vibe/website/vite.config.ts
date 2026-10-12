import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { injectPage } from './scripts/prerender.mjs'

const root = fileURLToPath(new URL('.', import.meta.url))
function prerenderedDevelopment(): Plugin {
  return {
    name: 'website-prerendered-development',
    apply: 'serve',
    configureServer(server) {
      return () => server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
        if (!['/', '/index.html'].includes(pathname) || !['GET', 'HEAD'].includes(request.method ?? '')) return next()
        try {
          const { renderPage } = await server.ssrLoadModule('/src/entry-server.tsx')
          const template = await server.transformIndexHtml(request.url ?? '/', await readFile(path.resolve(root, 'index.html'), 'utf8'))
          response.setHeader('Content-Type', 'text/html; charset=utf-8')
          const document = injectPage(template, renderPage())
          response.end(request.method === 'HEAD' ? undefined : document)
        } catch (error) {
          if (error instanceof Error) server.ssrFixStacktrace(error)
          next(error)
        }
      })
    },
  }
}

export default defineConfig(({ command, isPreview }) => ({
  appType: command === 'serve' && !isPreview ? 'custom' : 'mpa',
  envPrefix: ['VITE_', 'PUBLIC_'],
  plugins: [react(), tailwindcss(), prerenderedDevelopment()],
  resolve: { alias: { '@': path.resolve(root, 'src') }, dedupe: ['react', 'react-dom'] },
  server: { host: '127.0.0.1', port: 4321, strictPort: true },
  preview: { host: '127.0.0.1', port: 4321, strictPort: true },
}))
