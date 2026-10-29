import type { CheckOptions, PackageJsonMeta, ResolvedDepChange } from '../src/types'
import process from 'node:process'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { promptInteractive } from '../src/commands/check/interactive'

const stubbed: [object, PropertyKey, PropertyDescriptor | undefined][] = []

function stubProperty(target: object, key: PropertyKey, value: unknown) {
  stubbed.push([target, key, Object.getOwnPropertyDescriptor(target, key)])
  Object.defineProperty(target, key, { configurable: true, value })
}

beforeEach(() => {
  stubProperty(process.stdout, 'isTTY', false)
  stubProperty(process.stdout, 'rows', 40)
  stubProperty(process.stdout, 'columns', 120)
  stubProperty(process.stdin, 'isTTY', false)
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  vi.spyOn(console, 'clear').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()

  for (const [target, key, descriptor] of stubbed.splice(0).reverse()) {
    if (descriptor)
      Object.defineProperty(target, key, descriptor)
    else
      Reflect.deleteProperty(target, key)
  }
})

function makeDep(name: string, overrides: Partial<ResolvedDepChange> = {}): ResolvedDepChange {
  return {
    name,
    currentVersion: '^1.0.0',
    targetVersion: '^1.1.0',
    source: 'dependencies',
    update: true,
    diff: 'minor',
    pkgData: { tags: { latest: '1.1.0' }, versions: ['1.0.0', '1.1.0'] },
    provenanceDowngraded: false,
    ...overrides,
  }
}

function makePkg(resolved: ResolvedDepChange[]): PackageJsonMeta {
  return {
    name: 'test-pkg',
    private: true,
    version: '1.0.0',
    filepath: '/tmp/test-pkg/package.json',
    relative: 'package.json',
    type: 'package.json',
    raw: {},
    deps: [],
    resolved,
  }
}

// Press the given keys, then `return` to confirm, and collect the names of the
// dependencies left checked.
async function selectWith(resolved: ResolvedDepChange[], options: CheckOptions, keys: string[] = []) {
  const result = promptInteractive([makePkg(resolved)], options)

  for (const name of [...keys, 'return'])
    process.stdin.emit('keypress', '', { name, ctrl: false })

  const pkgs = await result
  return pkgs.flatMap(pkg => pkg.resolved.filter(dep => dep.update).map(dep => dep.name)).sort()
}

it('checks available updates by default', async () => {
  expect(await selectWith([makeDep('a'), makeDep('b')], {})).toEqual(['a', 'b'])
})

it('keeps provenance downgrades unchecked by default', async () => {
  const deps = [makeDep('a'), makeDep('b', { provenanceDowngraded: true })]
  expect(await selectWith(deps, {})).toEqual(['a'])
})

it('starts with nothing checked when preselect is false', async () => {
  expect(await selectWith([makeDep('a'), makeDep('b')], { preselect: false })).toEqual([])
})

it('still checks everything with `a` when preselect is false', async () => {
  expect(await selectWith([makeDep('a'), makeDep('b')], { preselect: false }, ['a'])).toEqual(['a', 'b'])
})
