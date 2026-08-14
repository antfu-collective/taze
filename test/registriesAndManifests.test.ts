import type { RawDep } from '../src/types'
import { describe, expect, it } from 'vitest'
import { manifests, writePackage } from '../src/manifests'
import { getGitHubActionDiff, getRegistry, registries, resolveDependency } from '../src/registries'
import { getDiff } from '../src/registries/shared'

describe('registries (package-type axis)', () => {
  it('exposes one registry per package type', () => {
    expect(Object.keys(registries).sort()).toEqual(['github-actions', 'npm'])
  })

  it('routes by packageType and defaults to npm', () => {
    expect(getRegistry('npm').name).toBe('npm')
    expect(getRegistry('github-actions').name).toBe('github-actions')
    expect(getRegistry(undefined).name).toBe('npm')
  })

  it('resolves github-actions deps through the github-actions registry without network', async () => {
    // No `githubAction` info -> the registry short-circuits to "no update",
    // proving the dep was routed to the github-actions registry (npm would try
    // to fetch metadata instead).
    const raw: RawDep = {
      name: 'actions/checkout',
      currentVersion: 'v4',
      source: 'github-actions',
      packageType: 'github-actions',
      update: true,
    }
    const resolved = await resolveDependency(raw, {})
    expect(resolved.update).toBe(false)
    expect(resolved.diff).toBe(null)
    expect(resolved.targetVersion).toBe('v4')
  })

  it('github-actions diff coerces partial tags, unlike the plain semver diff', () => {
    // partial tags like `v4` are not valid semver; the gha registry coerces them
    expect(getGitHubActionDiff('v4', 'v5')).toBe('major')
    expect(getGitHubActionDiff('v4', 'v4')).toBe(null)
    // the shared/npm diff still works for full semver
    expect(getDiff('1.2.3', '1.3.0')).toBe('minor')
  })
})

describe('manifests (file-source axis)', () => {
  it('registers every known file source', () => {
    expect(manifests.map(m => m.name).sort()).toEqual([
      '.yarnrc.yml',
      'bun-workspace',
      'github-action',
      'package.json',
      'package.yaml',
      'pnpm-workspace.yaml',
    ])
  })

  it('routes discovered paths to the right manifest via match()', () => {
    const owner = (relative: string) => manifests.find(m => m.match(relative))?.name
    expect(owner('package.json')).toBe('package.json')
    expect(owner('packages/a/package.yaml')).toBe('package.yaml')
    expect(owner('pnpm-workspace.yaml')).toBe('pnpm-workspace.yaml')
    expect(owner('.yarnrc.yml')).toBe('.yarnrc.yml')
    expect(owner('.github/workflows/ci.yml')).toBe('github-action')
    expect(owner('action.yml')).toBe('github-action')
  })

  it('orders catalog files before package files and github actions after', () => {
    const order = (name: string) => manifests.find(m => m.name === name)?.order ?? 0
    expect(order('.yarnrc.yml')).toBeLessThan(order('pnpm-workspace.yaml'))
    expect(order('pnpm-workspace.yaml')).toBeLessThan(order('package.json'))
    expect(order('package.json')).toBeLessThan(order('github-action'))
  })

  it('throws when writing an unknown package type', async () => {
    await expect(writePackage({ type: 'nope' } as any, {})).rejects.toThrow(/Unsupported package type/)
  })
})
