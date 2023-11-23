import process from 'node:process'
import { expect, it } from 'vitest'
import { SemVer } from 'semver'
import type { CheckOptions, DependencyFilter, RawDep } from '../src'
import { resolveDependency } from '../src'
import { getDiff } from '../src/io/resolves'

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
  expect(false).toBe((await resolveDependency(makePkg('4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('^4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('>4.0.0'), options, filter)).update)

  options.mode = 'minor'
  // minor
  expect(false).toBe((await resolveDependency(makePkg(''), options, filter)).update)
  expect(false).toBe((await resolveDependency(makePkg('*'), options, filter)).update)
  expect(false).toBe((await resolveDependency(makePkg('4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('^4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('>4.0.0'), options, filter)).update)

  options.mode = 'patch'
  // patch
  expect(false).toBe((await resolveDependency(makePkg(''), options, filter)).update)
  expect(false).toBe((await resolveDependency(makePkg('*'), options, filter)).update)
  expect(false).toBe((await resolveDependency(makePkg('4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('^4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('>4.0.0'), options, filter)).update)

  options.mode = 'latest'
  // latest
  expect(false).toBe((await resolveDependency(makePkg(''), options, filter)).update)
  expect(false).toBe((await resolveDependency(makePkg('*'), options, filter)).update)
  expect(false).toBe((await resolveDependency(makePkg('4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('^4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('>4.0.0'), options, filter)).update)

  options.mode = 'newest'
  // newest
  expect(false).toBe((await resolveDependency(makePkg(''), options, filter)).update)
  expect(false).toBe((await resolveDependency(makePkg('*'), options, filter)).update)
  expect(false).toBe((await resolveDependency(makePkg('4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('^4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('>4.0.0'), options, filter)).update)

  // include locked
  options.includeLocked = true
  expect(true).toBe((await resolveDependency(makePkg('4.0.0'), options, filter)).update)

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

it('getDiff', () => {
  // normal
  expect(getDiff(new SemVer('1.2.3'), new SemVer('1.2.3'))).toBe(null)
  expect(getDiff(new SemVer('1.2.3'), new SemVer('1.2.4'))).toBe('patch')
  expect(getDiff(new SemVer('1.2.3'), new SemVer('1.3.3'))).toBe('minor')
  expect(getDiff(new SemVer('1.2.3'), new SemVer('2.2.3'))).toBe('major')

  // 0.x
  expect(getDiff(new SemVer('0.1.2'), new SemVer('0.1.3'))).toBe('patch')
  expect(getDiff(new SemVer('0.1.2'), new SemVer('0.2.2'))).toBe('major')
  expect(getDiff(new SemVer('0.0.3'), new SemVer('0.0.4'))).toBe('major')

  // pre
  expect(getDiff(new SemVer('1.2.3-a'), new SemVer('1.2.3'))).toBe('patch')
  expect(getDiff(new SemVer('1.2.3-a'), new SemVer('1.2.4'))).toBe('patch')
  expect(getDiff(new SemVer('1.2.2'), new SemVer('1.2.3-a'))).toBe('patch')
  expect(getDiff(new SemVer('1.2.3-a'), new SemVer('1.2.3-b'))).toBe('patch')
  expect(getDiff(new SemVer('1.2.3-a'), new SemVer('1.2.4-b'))).toBe('patch')
  expect(getDiff(new SemVer('1.2.3-a'), new SemVer('1.3.3-a'))).toBe('minor')
  expect(getDiff(new SemVer('1.2.3-a'), new SemVer('2.2.3-a'))).toBe('major')
  expect(getDiff(new SemVer('2.0.0-a'), new SemVer('2.0.0'))).toBe('patch')
})
