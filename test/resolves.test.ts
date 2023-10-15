import process from 'node:process'
import { expect, it } from 'vitest'
import type { CheckOptions, DependencyFilter, RawDep } from '../src'
import { resolveDependency } from '../src'

const filter: DependencyFilter = () => true

function makePkg(ver: string): RawDep {
  const pkg: RawDep = {
    name: 'typescript',
    currentVersion: ver,
    source: 'dependencies',
    update: true,
  }
  return pkg
}

function makeLocalPkg(ver: string): RawDep {
  const pkg: RawDep = {
    name: 'xyg-mdb',
    currentVersion: ver,
    source: 'dependencies',
    update: true,
  }
  return pkg
}

const options: CheckOptions = {
  cwd: process.cwd(),
  loglevel: 'silent',
  mode: 'default',
  write: false,
  all: false,
}

it('resolveDependency', async () => {
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

  // local pkg
  expect(false).toBe((await resolveDependency(makeLocalPkg('file:../aaa'), options, filter)).update)
  expect(false).toBe((await resolveDependency(makeLocalPkg('link:../aaa'), options, filter)).update)
  expect(false).toBe((await resolveDependency(makeLocalPkg('workspace:*'), options, filter)).update)
  const target = await resolveDependency(makeLocalPkg('1.0.0'), options, filter)
  expect(target.resolveError).not.toBeNull()
}, 10000)
