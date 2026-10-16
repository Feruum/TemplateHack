import { expect, test } from 'bun:test'
import path from 'node:path'
import { normalizeDatathonArguments } from './datathon-args.mjs'

test('datathon file arguments resolve from the caller directory in both flag forms', () => {
  const cwd = process.cwd()
  expect(normalizeDatathonArguments(['--data=train.csv', '--predict', 'test.csv', '--output=chosen'], cwd)).toEqual([
    '--data', path.resolve(cwd, 'train.csv'), '--predict', path.resolve(cwd, 'test.csv'), '--output', path.resolve(cwd, 'chosen'),
  ])
})

test('datathon accepts a forwarding separator without changing model options', () => {
  expect(normalizeDatathonArguments(['--', '--task', 'regression', '--seed=7'], process.cwd())).toEqual(['--task', 'regression', '--seed=7'])
})
