import { expect, test } from 'vitest'
import type { CheckOptions, DependencyFilter, RawDep } from '../src'
import { resolveDependency } from '../src'

const filter: DependencyFilter = () => true

const makePkg = (ver: string): RawDep => {
  const pkg: RawDep = {
    name: 'typescript',
    currentVersion: ver,
    source: 'dependencies',
    update: true,
  }
  return pkg
}

test('resolveDependency', async () => {
  const options: CheckOptions = {
    cwd: process.cwd(),
    loglevel: 'silent',
    mode: 'default',
    write: false,
    all: false,
    sortReversed: false,
    sort: false,
  }
  // default
  expect(false).toBe((await resolveDependency(makePkg(''), options, filter)).update)
  expect(false).toBe((await resolveDependency(makePkg('*'), options, filter)).update)
  expect(false).toBe((await resolveDependency(makePkg('4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('^4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('>4.0.0'), options, filter)).update)

  options.mode = 'major'
  // major
  expect(false).toBe((await resolveDependency(makePkg(''), options, filter)).update)
  expect(false).toBe((await resolveDependency(makePkg('*'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('^4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('>4.0.0'), options, filter)).update)

  options.mode = 'minor'
  // minor
  expect(false).toBe((await resolveDependency(makePkg(''), options, filter)).update)
  expect(false).toBe((await resolveDependency(makePkg('*'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('^4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('>4.0.0'), options, filter)).update)

  options.mode = 'patch'
  // patch
  expect(false).toBe((await resolveDependency(makePkg(''), options, filter)).update)
  expect(false).toBe((await resolveDependency(makePkg('*'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('^4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('>4.0.0'), options, filter)).update)

  options.mode = 'latest'
  // latest
  expect(false).toBe((await resolveDependency(makePkg(''), options, filter)).update)
  expect(false).toBe((await resolveDependency(makePkg('*'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('^4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('>4.0.0'), options, filter)).update)

  options.mode = 'newest'
  // newest
  expect(false).toBe((await resolveDependency(makePkg(''), options, filter)).update)
  expect(false).toBe((await resolveDependency(makePkg('*'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('^4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('>4.0.0'), options, filter)).update)

  expect((await resolveDependency(makePkg(''), options, filter)).targetVersion)
    .toMatch('')
  expect((await resolveDependency(makePkg('workspace:*'), options, filter)).targetVersion)
    .toMatch('workspace:*')
  expect((await resolveDependency(makePkg('workspace:*'), options, filter)).resolveError)
    .toBeUndefined()
  expect((await resolveDependency(makePkg('random'), options, filter)).targetVersion)
    .toMatch('random')
  expect((await resolveDependency(makePkg('random'), options, filter)).resolveError)
    .toBeUndefined()
})
