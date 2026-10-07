import { expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const scratch = resolve(root, '.scratch')
const scripts = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).scripts

function runEnvironmentProbe(command, workspace = 'backend', workspaceTask = 'dev') {
  mkdirSync(scratch, { recursive: true })
  const fixture = mkdtempSync(resolve(scratch, 'workspace-env-'))
  if (!fixture.startsWith(`${scratch}${sep}`)) throw new Error('Fixture must stay under .scratch')
  try {
    mkdirSync(resolve(fixture, workspace))
    mkdirSync(resolve(fixture, 'node_modules'))
    symlinkSync(resolve(root, 'node_modules/turbo'), resolve(fixture, 'node_modules/turbo'), process.platform === 'win32' ? 'junction' : 'dir')
    writeFileSync(resolve(fixture, 'package.json'), JSON.stringify({
      name: 'workspace-env-fixture', private: true, packageManager: 'bun@1.4.0',
      workspaces: [workspace], scripts: { dev: command },
    }))
    writeFileSync(resolve(fixture, 'turbo.json'), JSON.stringify({
      tasks: { dev: { cache: false, passThroughEnv: ['*'] } },
    }))
    writeFileSync(resolve(fixture, workspace, 'package.json'), JSON.stringify({
      name: workspace, scripts: { [workspaceTask]: 'node ../probe.mjs' },
    }))
    writeFileSync(resolve(fixture, '.env'), 'DATABASE_URL=workspace-env-fixture\nJWT_SECRET=workspace-env-fixture\n')
    writeFileSync(resolve(fixture, 'probe.mjs'), `
      const valid = process.env.DATABASE_URL === 'workspace-env-fixture'
        && process.env.JWT_SECRET === 'workspace-env-fixture';
      if (!valid) process.stderr.write('Root configuration did not reach the workspace.\\n');
      process.exitCode = valid ? 0 : 1;
    `)
    const env = { ...process.env, TURBO_TELEMETRY_DISABLED: '1' }
    delete env.DATABASE_URL
    delete env.JWT_SECRET
    return spawnSync(process.execPath, ['run', 'dev'], {
      cwd: fixture, env, encoding: 'utf8', timeout: 30_000,
    })
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
}

test('root development command passes .env settings into another workspace', () => {
  const result = runEnvironmentProbe(scripts.dev)
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(0)
}, 30_000)

test('the environment regression probe detects the original bare Turbo command', () => {
  const result = runEnvironmentProbe('turbo run dev')
  expect(result.status).not.toBe(0)
  expect(`${result.stdout}${result.stderr}`).toContain('Root configuration did not reach the workspace.')
}, 30_000)

for (const workspace of ['backend', 'webapp', 'website']) {
  test(`standalone ${workspace} development receives the root .env`, () => {
    const result = runEnvironmentProbe(scripts[`dev:${workspace}`], workspace)
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
  }, 30_000)
}

test('the development seed command receives the root .env', () => {
  const result = runEnvironmentProbe(scripts['dev:seed'], 'backend', 'db:seed')
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(0)
}, 30_000)
