#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeDatathonArguments } from './datathon-args.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const project = path.join(root, 'datathon')
const python = path.join(project, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
const [command, ...rawArgs] = process.argv.slice(2)

function run(executable, args) {
  const result = spawnSync(executable, args, { cwd: project, stdio: 'inherit', env: { ...process.env, PYTHONUTF8: '1', MPLBACKEND: 'Agg' } })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

try {
  if (command === 'setup') {
    if (!existsSync(python)) {
      const candidates = process.env.DATATHON_PYTHON ? [[process.env.DATATHON_PYTHON, []]] : [['python3', []], ['python', []], ['py', ['-3']]]
      const selected = candidates.find(([binary, prefix]) => {
        const probe = spawnSync(binary, [...prefix, '-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)'], { stdio: 'ignore' })
        return !probe.error && probe.status === 0
      })
      if (!selected) throw new Error('Python 3.12+ was not found. Install Python or set DATATHON_PYTHON to its executable path, then run bun run datathon:setup.')
      run(selected[0], [...selected[1], '-m', 'venv', path.join(project, '.venv')])
    }
    run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', 'requirements.lock'])
    run(python, ['-m', 'pip', 'check'])
  } else {
    if (!existsSync(python)) throw new Error('Datathon environment is missing. Run bun run datathon:setup first.')
    if (command === 'test') {
      run(python, ['-m', 'unittest', 'discover', '-s', 'tests', '-v'])
    } else if (['eda', 'run', 'demo'].includes(command)) {
      const args = normalizeDatathonArguments(rawArgs, process.cwd())
      if (command === 'demo' && !args.includes('--output')) {
        mkdirSync(path.join(root, '.artifacts'), { recursive: true })
        args.push('--output', path.join(root, '.artifacts', `datathon-demo-${new Date().toISOString().replace(/[:.]/g, '-')}`))
      }
      run(python, ['-m', 'datathon_cli', command, ...args])
    } else {
      throw new Error('Choose setup, test, demo, eda, or run. Use bun run datathon --help for run options.')
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
