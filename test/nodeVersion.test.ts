import type { CheckOptions, PackageData, PackageMeta } from '../src/types'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CheckPackages } from '../src'
import { getNodeDiff } from '../src/registries/node/registry'
import {
  formatVersionReference,
  parseVersionReference,
  selectVersionTarget,
} from '../src/utils/versionReference'

const { fetchNodeReleasesMock } = vi.hoisted(() => ({
  fetchNodeReleasesMock: vi.fn(),
}))

vi.mock('../src/utils/node', () => ({
  fetchNodeReleases: fetchNodeReleasesMock,
}))

const tempDirs: string[] = []

function nodeData(): PackageData {
  const dates: Record<string, string> = {
    'v20.10.0': '2023-11-22T00:00:00.000Z',
    'v20.11.0': '2024-01-09T00:00:00.000Z',
    'v20.20.2': '2025-06-01T00:00:00.000Z',
    'v22.14.0': '2025-02-11T00:00:00.000Z',
    'v22.14.1': '2025-02-18T00:00:00.000Z',
    'v24.0.0': '2025-05-06T00:00:00.000Z',
    'v26.7.0': '2026-08-05T00:00:00.000Z',
  }
  const versions = Object.keys(dates)
  return {
    tags: { latest: versions.at(-1)! },
    versions,
    time: dates,
  }
}

function createProject(files: Record<string, string>) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'taze-node-version-'))
  tempDirs.push(cwd)
  for (const [name, content] of Object.entries(files))
    fs.writeFileSync(path.join(cwd, name), content, 'utf-8')
  return cwd
}

async function check(files: Record<string, string>, options: CheckOptions = {}) {
  const cwd = createProject(files)
  const result = await CheckPackages({ cwd, force: true, loglevel: 'silent', ...options })
  return { cwd, ...result }
}

beforeEach(() => {
  fetchNodeReleasesMock.mockReset()
  fetchNodeReleasesMock.mockImplementation(async () => nodeData())
})

afterEach(() => {
  for (const dir of tempDirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true })
})

describe('version reference parsing', () => {
  it('parses optional prefix and granularity', () => {
    expect(parseVersionReference('22')).toMatchObject({ prefix: '', major: 22, segments: 1 })
    expect(parseVersionReference('22.14')).toMatchObject({ prefix: '', major: 22, minor: 14, segments: 2 })
    expect(parseVersionReference('v22.14.0')).toMatchObject({ prefix: 'v', major: 22, minor: 14, patch: 0, segments: 3 })
    expect(parseVersionReference('lts/*')).toBeNull()
  })

  it('formats a version to match the template granularity/prefix', () => {
    const target = parseVersionReference('v24.1.2')!
    expect(formatVersionReference(target, parseVersionReference('22')!)).toBe('24')
    expect(formatVersionReference(target, parseVersionReference('22.14')!)).toBe('24.1')
    expect(formatVersionReference(target, parseVersionReference('v22.14.0')!)).toBe('v24.1.2')
  })

  it('selects targets honoring the mode and granularity', () => {
    const versions = ['v20.10.0', 'v22.14.0', 'v22.14.1', 'v24.0.0']
    expect(selectVersionTarget('20', versions, 'default')).toMatchObject({ target: '20', resolvedVersion: 'v20.10.0' })
    expect(selectVersionTarget('22.14.0', versions, 'patch')).toMatchObject({ target: '22.14.1' })
    expect(selectVersionTarget('20.10.0', versions, 'major')).toMatchObject({ target: '24.0.0', resolvedVersion: 'v24.0.0' })
  })
})

describe('node diff', () => {
  it('classifies the change between two references', () => {
    expect(getNodeDiff('v20.10.0', 'v20.11.0')).toBe('minor')
    expect(getNodeDiff('v20.10.0', 'v20.10.1')).toBe('patch')
    expect(getNodeDiff('20', '24')).toBe('major')
    expect(getNodeDiff('v20.10.0', 'v20.10.0')).toBeNull()
  })
})

describe('node version discovery & resolution', () => {
  it('discovers a .node-version file and resolves within the current major by default', async () => {
    const { packages } = await check({ '.node-version': '20.10.0\n' })
    const pkg = packages.find(p => p.type === 'node-version')!

    expect(pkg).toBeTruthy()
    expect(pkg.relative).toBe('.node-version')
    const node = pkg.resolved.find(d => d.name === 'node')!
    expect(node).toMatchObject({ currentVersion: '20.10.0', targetVersion: '20.20.2', update: true, diff: 'minor' })
    // surfaces the newer major that a bigger mode would pick
    expect(node.latestVersionAvailable).toBe('26.7.0')
  })

  it('bumps to a newer major in major mode, preserving the v prefix and granularity', async () => {
    const { packages } = await check({ '.node-version': 'v20.10.0\n' }, { mode: 'major' })
    const node = packages.find(p => p.type === 'node-version')!.resolved.find(d => d.name === 'node')!
    expect(node).toMatchObject({ currentVersion: 'v20.10.0', targetVersion: 'v26.7.0', update: true, diff: 'major' })
  })

  it('keeps a major-only reference major-only', async () => {
    const { packages } = await check({ '.node-version': '20\n' }, { mode: 'major' })
    const node = packages.find(p => p.type === 'node-version')!.resolved.find(d => d.name === 'node')!
    expect(node).toMatchObject({ currentVersion: '20', targetVersion: '26', update: true })
  })

  it('discovers .nvmrc as well', async () => {
    const { packages } = await check({ '.nvmrc': '20.10.0\n' }, { mode: 'major' })
    const pkg = packages.find(p => p.type === 'node-version' && p.relative === '.nvmrc')!
    expect(pkg).toBeTruthy()
    expect(pkg.resolved.find(d => d.name === 'node')).toMatchObject({ targetVersion: '26.7.0', update: true })
  })

  it('skips alias references it cannot resolve', async () => {
    const { packages } = await check({ '.nvmrc': 'lts/*\n' }, { mode: 'major' })
    expect(packages.find(p => p.type === 'node-version')).toBeUndefined()
  })

  it('can be disabled via nodeVersion: false', async () => {
    const { packages } = await check({ '.node-version': '20.10.0\n' }, { mode: 'major', nodeVersion: false })
    expect(packages.find(p => p.type === 'node-version')).toBeUndefined()
  })

  it('honors --exclude node', async () => {
    const { packages } = await check({ '.node-version': '20.10.0\n' }, { mode: 'major', exclude: ['node'] })
    const node = packages.find(p => p.type === 'node-version')!.resolved.find(d => d.name === 'node')!
    expect(node.update).toBe(false)
  })
})

describe('devEngines.runtime', () => {
  const pkg = (runtime: unknown) => ({ 'package.json': JSON.stringify({ name: 'demo', private: true, devEngines: { runtime } }) })
  const runtimeDep = (packages: PackageMeta[]) =>
    packages.find(p => p.type === 'package.json')!.resolved.find(d => d.source === 'devEngines.runtime')!

  it('resolves a semver range within the current major by default, preserving the operator', async () => {
    const { packages } = await check(pkg({ name: 'node', version: '^20.0.0' }))
    expect(runtimeDep(packages)).toMatchObject({ name: 'node', currentVersion: '^20.0.0', targetVersion: '^20.20.2', update: true, diff: 'minor' })
  })

  it('bumps to a newer major in major mode', async () => {
    const { packages } = await check(pkg({ name: 'node', version: '>=20', onFail: 'error' }), { mode: 'major' })
    expect(runtimeDep(packages)).toMatchObject({ currentVersion: '>=20', targetVersion: '>=26.7.0', update: true, diff: 'major' })
  })

  it('only touches the node entry when runtime is an array', async () => {
    const { cwd } = await check(pkg([
      { name: 'node', version: '^20.0.0' },
      { name: 'deno', version: '>=1.0.0' },
    ]), { mode: 'major', write: true })
    const written = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'))
    expect(written.devEngines.runtime).toEqual([
      { name: 'node', version: '^26.7.0' },
      { name: 'deno', version: '>=1.0.0' },
    ])
  })

  it('writes the version in place, preserving other keys', async () => {
    const { cwd } = await check(pkg({ name: 'node', version: '^20.0.0', onFail: 'error' }), { mode: 'major', write: true })
    const written = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'))
    expect(written.devEngines.runtime).toEqual({ name: 'node', version: '^26.7.0', onFail: 'error' })
  })

  it('is skipped when nodeVersion is disabled', async () => {
    const { packages } = await check(pkg({ name: 'node', version: '^20.0.0' }), { mode: 'major', nodeVersion: false })
    expect(packages.find(p => p.type === 'package.json')!.resolved.some(d => d.source === 'devEngines.runtime')).toBe(false)
  })
})

describe('node version writing', () => {
  it('writes .node-version preserving prefix, granularity and trailing newline', async () => {
    const { cwd } = await check({ '.node-version': 'v20.10.0\n' }, { mode: 'major', write: true })
    expect(fs.readFileSync(path.join(cwd, '.node-version'), 'utf-8')).toBe('v26.7.0\n')
  })

  it('writes .nvmrc preserving comments and blank lines', async () => {
    const original = '# pinned for CI\n\n20.10.0\n'
    const { cwd } = await check({ '.nvmrc': original }, { mode: 'major', write: true })
    expect(fs.readFileSync(path.join(cwd, '.nvmrc'), 'utf-8')).toBe('# pinned for CI\n\n26.7.0\n')
  })

  it('leaves the file untouched when there is no update', async () => {
    const original = '26.7.0\n'
    const { cwd } = await check({ '.node-version': original }, { mode: 'major', write: true })
    expect(fs.readFileSync(path.join(cwd, '.node-version'), 'utf-8')).toBe(original)
  })
})
