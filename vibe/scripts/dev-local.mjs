#!/usr/bin/env bun
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const compose = ['compose', 'up', '-d', '--build', 'postgres', 'chroma', 'agent']

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32' && command === 'docker',
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status ?? result.signal})`)
}

run('docker', compose)
run('bun', ['run', '--cwd', 'backend', 'db:migrate'])

// Turbo starts the persistent app tasks only after this prerequisite succeeds.
console.log(`Local infrastructure ready. Turbo will start website http://localhost:4321 · app http://localhost:5173 · API http://localhost:${process.env.PORT ?? 3000}`)
console.log(`Agent: http://localhost:${process.env.AGENT_PORT ?? 8001} (configure AGENT_LLM_* in .env to enable chat). Ctrl+C stops app processes; database, Chroma, and uploads stay in Docker volumes.`)
