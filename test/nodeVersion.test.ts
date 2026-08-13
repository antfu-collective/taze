import type { CheckOptions, PackageData } from '../src/types'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import { resolve as resolvePath } from 'pathe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CheckPackages } from '../src'
import { promptInteractive } from '../src/commands/check/interactive'
import { getJsonOutput, renderChange } from '../src/commands/check/render'
import { formatResolvedTargetVersion, getVersionOfRange, updateTargetVersion } from '../src/io/resolves'

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
    'v20.10.1': '2023-11-29T00:00:00.000Z',
    'v20.11.0': '2024-01-09T00:00:00.000Z',
    'v22.14.0': '2025-02-11T00:00:00.000Z',
    'v22.14.1': '2025-02-18T00:00:00.000Z',
    'v22.21.3': '2025-11-25T00:00:00.000Z',
    'v22.22.0': '2099-01-01T00:00:00.000Z',
    'v24.0.0': '2025-05-06T00:00:00.000Z',
    'v26.1.0': '2026-01-20T00:00:00.000Z',
  }
  const versions = Object.keys(dates)
  return {
    tags: { latest: versions.at(-1)! },
    versions,
    time: dates,
  }
}

function createProject(nodeVersion?: string) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'taze-node-version-'))
  tempDirs.push(cwd)
  if (nodeVersion != null)
    fs.writeFileSync(path.join(cwd, '.node-version'), nodeVersion, 'utf-8')
  return cwd
}

async function check(nodeVersion: string, options: CheckOptions = {}) {
  const cwd = createProject(nodeVersion)
  const result = await CheckPackages({ cwd, force: true, loglevel: 'silent', ...options })
  return { cwd, ...result }
}

beforeEach(() => {
  fetchNodeReleasesMock.mockReset()
  fetchNodeReleasesMock.mockImplementation(async () => nodeData())
})

afterEach(() => {
  for (const tempDir of tempDirs.splice(0))
    fs.rmSync(tempDir, { recursive: true, force: true })
})

describe('.node-version discovery', () => {
  it('discovers a root version file without package.json', async () => {
    const { cwd, packages } = await check('22.14.0\n')

    expect(packages).toEqual([
      expect.objectContaining({
        filepath: resolvePath(cwd, '.node-version'),
        relative: '.node-version',
        type: 'node-version',
      }),
    ])
  })

  it('discovers nested files only in recursive mode', async () => {
    const cwd = createProject('22.14.0\n')
    fs.mkdirSync(path.join(cwd, 'packages/app'), { recursive: true })
    fs.writeFileSync(path.join(cwd, 'packages/app/.node-version'), '20.10.0\n')

    const root = await CheckPackages({ cwd, force: true, loglevel: 'silent' })
    const recursive = await CheckPackages({ cwd, force: true, loglevel: 'silent', recursive: true })

    expect(root.packages.map(pkg => pkg.relative)).toEqual(['.node-version'])
    expect(recursive.packages.map(pkg => pkg.relative)).toEqual(['.node-version', 'packages/app/.node-version'])
  })

  it('applies ignorePaths and ignoreOtherWorkspaces to nested files', async () => {
    const cwd = createProject('22.14.0\n')
    fs.mkdirSync(path.join(cwd, 'ignored'), { recursive: true })
    fs.writeFileSync(path.join(cwd, 'ignored/.node-version'), '20.10.0\n')
    fs.mkdirSync(path.join(cwd, 'workspace/.git'), { recursive: true })
    fs.writeFileSync(path.join(cwd, 'workspace/.node-version'), '20.10.0\n')

    const { packages } = await CheckPackages({
      cwd,
      force: true,
      loglevel: 'silent',
      recursive: true,
      ignorePaths: ['**/ignored/**'],
      ignoreOtherWorkspaces: true,
    })

    expect(packages.map(pkg => pkg.relative)).toEqual(['.node-version'])
  })

  it('does not traverse version-control internals', async () => {
    const cwd = createProject('22.14.0\n')
    fs.mkdirSync(path.join(cwd, '.git/objects/nested'), { recursive: true })
    fs.writeFileSync(path.join(cwd, '.git/objects/nested/.node-version'), '20.10.0\n')

    const { packages } = await CheckPackages({
      cwd,
      force: true,
      ignoreOtherWorkspaces: false,
      loglevel: 'silent',
      recursive: true,
    })

    expect(packages.map(pkg => pkg.relative)).toEqual(['.node-version'])
  })

  it('can be disabled', async () => {
    const { packages } = await check('22.14.0\n', { nodeVersion: false })

    expect(packages).toEqual([])
    expect(fetchNodeReleasesMock).not.toHaveBeenCalled()
  })
})

describe('.node-version selection', () => {
  it.each([
    ['patch', 'v22.14.1'],
    ['default', 'v22.22.0'],
    ['minor', 'v22.22.0'],
    ['stable', 'v22.22.0'],
    ['major', 'v26.1.0'],
    ['latest', 'v26.1.0'],
    ['newest', 'v26.1.0'],
    ['next', 'v26.1.0'],
  ] as const)('uses the %s boundary', async (mode, targetVersion) => {
    const { packages } = await check('v22.14.0\n', { mode })

    expect(packages[0].resolved[0]).toMatchObject({ targetVersion, update: true })
  })

  it.each([
    ['22', 'default', '22', false],
    ['22', 'major', '26', true],
    ['22.14', 'default', '22.22', true],
    ['22.14', 'patch', '22.14', false],
    ['22.14.0', 'patch', '22.14.1', true],
    ['v22.14.0', 'default', 'v22.22.0', true],
  ] as const)('preserves %s granularity in %s mode', async (currentVersion, mode, targetVersion, update) => {
    const { packages } = await check(`${currentVersion}\n`, { mode })

    expect(packages[0].resolved[0]).toMatchObject({ targetVersion, update })
  })

  it('ignores includeLocked for node version files', async () => {
    const without = await check('22.14.0\n', { includeLocked: false })
    const withLocked = await check('22.14.0\n', { includeLocked: true })

    expect(without.packages[0].resolved[0].targetVersion).toBe('22.22.0')
    expect(withLocked.packages[0].resolved[0].targetVersion).toBe('22.22.0')
  })

  it('supports include, exclude, packageMode, and version-specific exclusions', async () => {
    const excludedByInclude = await check('22.14.0\n', { include: 'typescript' })
    const excluded = await check('22.14.0\n', { exclude: 'node' })
    const major = await check('22.14.0\n', { packageMode: { node: 'major' } })
    const bounded = await check('22.14.0\n', { exclude: 'node@>=22.22.0' })

    expect(excludedByInclude.packages[0].resolved[0].update).toBe(false)
    expect(excluded.packages[0].resolved[0].update).toBe(false)
    expect(major.packages[0].resolved[0].targetVersion).toBe('26.1.0')
    expect(bounded.packages[0].resolved[0].targetVersion).toBe('22.21.3')
  })

  it('applies maturityPeriod using release dates', async () => {
    const { packages } = await check('22.14.0\n', { maturityPeriod: 7 })

    expect(packages[0].resolved[0].targetVersion).toBe('22.21.3')
    expect(packages[0].resolved[0].targetVersionTime).toBe('2025-11-25T00:00:00.000Z')
  })

  it('offers the latest major when the current major is already up to date', async () => {
    const { packages } = await check('v22.22.0\n')

    expect(packages[0].resolved[0]).toMatchObject({
      latestVersionAvailable: 'v26.1.0',
      latestVersionAvailableResolved: 'v26.1.0',
      targetVersion: 'v22.22.0',
      update: false,
    })
  })

  it('shares one forced Node index request across recursive files', async () => {
    const cwd = createProject('22.14.0\n')
    fs.mkdirSync(path.join(cwd, 'nested'), { recursive: true })
    fs.writeFileSync(path.join(cwd, 'nested/.node-version'), '20.10.0\n')

    await CheckPackages({ cwd, concurrency: 1, force: true, loglevel: 'silent', recursive: true })

    expect(fetchNodeReleasesMock).toHaveBeenCalledTimes(1)
  })

  it('shares a failed forced request without partially writing recursive files', async () => {
    const cwd = createProject('22.14.0\n')
    fs.mkdirSync(path.join(cwd, 'nested'), { recursive: true })
    fs.writeFileSync(path.join(cwd, 'nested/.node-version'), '20.10.0\n')
    fetchNodeReleasesMock.mockRejectedValue(new Error('Node API unavailable'))

    const { packages } = await CheckPackages({
      concurrency: 1,
      cwd,
      force: true,
      loglevel: 'silent',
      recursive: true,
      write: true,
    })

    expect(fetchNodeReleasesMock).toHaveBeenCalledTimes(1)
    expect(packages.flatMap(pkg => pkg.resolved)).toEqual([
      expect.objectContaining({ resolveError: 'Node API unavailable', update: false }),
      expect.objectContaining({ resolveError: 'Node API unavailable', update: false }),
    ])
    expect(fs.readFileSync(path.join(cwd, '.node-version'), 'utf-8')).toBe('22.14.0\n')
    expect(fs.readFileSync(path.join(cwd, 'nested/.node-version'), 'utf-8')).toBe('20.10.0\n')
  })

  it('does not treat a private package named node as the runtime dependency', async () => {
    const cwd = createProject('22.14.0\n')
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ name: 'node', private: true }))

    const { packages } = await CheckPackages({ cwd, force: true, loglevel: 'silent' })
    const nodeVersion = packages.find(pkg => pkg.type === 'node-version')!

    expect(nodeVersion.resolved[0]).toMatchObject({ targetVersion: '22.22.0', update: true })
    expect(fetchNodeReleasesMock).toHaveBeenCalledTimes(1)
  })
})

describe('.node-version writing and output', () => {
  it('preserves prefix, granularity, surrounding whitespace, and final newlines', async () => {
    const original = ' \tv22.14.0 \n\n'
    const { cwd } = await check(original, { write: true })

    expect(fs.readFileSync(path.join(cwd, '.node-version'), 'utf-8')).toBe(' \tv22.22.0 \n\n')
  })

  it('does not write after a Node.js release API error', async () => {
    fetchNodeReleasesMock.mockRejectedValueOnce(new Error('Node API unavailable'))
    const original = '22.14.0\n'
    const { cwd, packages } = await check(original, { write: true })

    expect(packages[0].resolved[0]).toMatchObject({
      resolveError: 'Node API unavailable',
      update: false,
    })
    expect(fs.readFileSync(path.join(cwd, '.node-version'), 'utf-8')).toBe(original)
  })

  it('writes through a .node-version symlink contained in cwd', async () => {
    const cwd = createProject()
    const target = path.join(cwd, 'node-version-target')
    fs.writeFileSync(target, '22.14.0\n')
    fs.symlinkSync(target, path.join(cwd, '.node-version'))

    await CheckPackages({ cwd, force: true, loglevel: 'silent', write: true })

    expect(fs.readFileSync(target, 'utf-8')).toBe('22.22.0\n')
  })

  it('refuses to write through a .node-version symlink outside cwd', async () => {
    const cwd = createProject()
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'taze-node-version-outside-'))
    tempDirs.push(outside)
    const victim = path.join(outside, 'victim.txt')
    fs.writeFileSync(victim, '22.14.0\n')
    fs.symlinkSync(victim, path.join(cwd, '.node-version'))

    const checkPromise = CheckPackages({
      cwd,
      force: true,
      loglevel: 'silent',
      write: true,
    })

    await expect(checkPromise).rejects.toThrow('Refusing to write .node-version outside cwd')
    expect(fs.readFileSync(victim, 'utf-8')).toBe('22.14.0\n')
  })

  it('emits node-version package and dependency metadata in JSON', async () => {
    const { cwd, packages } = await check('22.14.0\n')

    expect(getJsonOutput(packages, { all: true })).toEqual({
      packages: [{
        name: '.node-version',
        type: 'node-version',
        filepath: resolvePath(cwd, '.node-version'),
        relative: '.node-version',
        resolved: [expect.objectContaining({
          name: 'node',
          source: 'node-version',
          currentVersion: '22.14.0',
          targetVersion: '22.22.0',
        })],
      }],
    })
  })

  it('exposes source-aware target helpers for interactive selection', async () => {
    const { packages } = await check('v22.14\n')
    const dep = packages[0].resolved[0]
    const version = getVersionOfRange(dep, 'major', {})!

    expect(formatResolvedTargetVersion(dep, version)).toBe('v26.1')
    updateTargetVersion(dep, version)
    expect(dep).toMatchObject({ targetVersion: 'v26.1', update: true })
  })

  it('retains the full release metadata for a partial interactive target', async () => {
    const { packages } = await check('v22.14\n')
    const dep = packages[0].resolved[0]

    expect(dep).toMatchObject({
      latestVersionAvailable: 'v26.1',
      latestVersionAvailableResolved: 'v26.1.0',
    })

    updateTargetVersion(dep, dep.latestVersionAvailableResolved!)

    expect(dep).toMatchObject({
      targetVersion: 'v26.1',
      targetVersionTime: '2026-01-20T00:00:00.000Z',
      update: true,
    })
    const output = stripVTControlCharacters(renderChange(dep).join(' '))
    expect(output).not.toContain('(v26.1 available)')
  })

  it('preserves Node API errors when interactive mode has no choices', async () => {
    fetchNodeReleasesMock.mockRejectedValueOnce(new Error('Node API unavailable'))
    const { packages } = await check('22.14.0\n')

    await expect(promptInteractive(packages, {})).resolves.toBe(packages)
    expect(packages[0].resolved[0]).toMatchObject({
      resolveError: 'Node API unavailable',
      update: false,
    })
  })
})

describe('.node-version validation', () => {
  it.each([
    'lts/*',
    'node',
    '^22',
    '22.0.0-rc.1',
    '22.0.0+build',
    '22.0.0 extra',
  ])('skips unsupported content %j without a network request', async (content) => {
    const { packages } = await check(`${content}\n`)

    expect(packages).toEqual([])
    expect(fetchNodeReleasesMock).not.toHaveBeenCalled()
  })
})
