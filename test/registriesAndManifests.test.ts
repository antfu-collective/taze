import type { Manifest } from '../src/manifests'
import type { RawDep } from '../src/types'
import { describe, expect, it } from 'vitest'
import { builtinManifests, getManifests, loadPackage, writePackage } from '../src/manifests'
import { getDiff, getGitHubActionDiff, getRegistry, registries, resolveDependency } from '../src/registries'

describe('registries (package-type axis)', () => {
  it('exposes one registry per package type', () => {
    expect(Object.keys(registries).sort()).toEqual(['github-actions', 'jsr', 'npm'])
  })

  it('routes by packageType and defaults to npm', () => {
    expect(getRegistry('npm').name).toBe('npm')
    expect(getRegistry('github-actions').name).toBe('github-actions')
    expect(getRegistry('jsr').name).toBe('jsr')
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
    expect(builtinManifests.map(m => m.name).sort()).toEqual([
      '.yarnrc.yml',
      'bun-workspace',
      'github-action',
      'package.json',
      'package.yaml',
      'pnpm-workspace.yaml',
    ])
  })

  it('routes discovered files to the right manifest via match() on the full path', () => {
    const owner = (filepath: string) => builtinManifests.find(m => m.match(filepath))?.name
    expect(owner('/repo/package.json')).toBe('package.json')
    expect(owner('/repo/packages/a/package.yaml')).toBe('package.yaml')
    expect(owner('/repo/pnpm-workspace.yaml')).toBe('pnpm-workspace.yaml')
    expect(owner('/repo/.yarnrc.yml')).toBe('.yarnrc.yml')
    expect(owner('/repo/.github/workflows/ci.yml')).toBe('github-action')
    expect(owner('/repo/action.yml')).toBe('github-action')
  })

  it('orders catalog files before package files and github actions after', () => {
    const order = (name: string) => builtinManifests.find(m => m.name === name)?.order ?? 0
    expect(order('.yarnrc.yml')).toBeLessThan(order('pnpm-workspace.yaml'))
    expect(order('pnpm-workspace.yaml')).toBeLessThan(order('package.json'))
    expect(order('package.json')).toBeLessThan(order('github-action'))
  })

  it('throws when writing an unknown package type', async () => {
    await expect(writePackage({ type: 'nope' } as any, {})).rejects.toThrow(/Unsupported package type/)
  })
})

describe('custom manifests via options', () => {
  function makeCustom() {
    const custom = {
      name: 'custom',
      type: 'custom-type',
      loaded: [] as string[],
      written: [] as string[],
      match: (filepath: string) => filepath.endsWith('custom.json'),
      async load(relative: string) {
        custom.loaded.push(relative)
        return []
      },
      async write(pkg: any) {
        custom.written.push(pkg.type)
      },
    }
    return custom
  }

  it('merges custom manifests ahead of the built-ins', () => {
    const custom = makeCustom()
    expect(getManifests({})).toBe(builtinManifests)
    const merged = getManifests({ manifests: [custom as unknown as Manifest] })
    expect(merged[0]).toBe(custom)
    expect(merged).toHaveLength(builtinManifests.length + 1)
  })

  it('routes matching loads to a custom manifest', async () => {
    const custom = makeCustom()
    await loadPackage('a/custom.json', { manifests: [custom as unknown as Manifest] }, () => true)
    expect(custom.loaded).toEqual(['a/custom.json'])
  })

  it('routes writes to a custom manifest by type', async () => {
    const custom = makeCustom()
    await writePackage({ type: 'custom-type' } as any, { manifests: [custom as unknown as Manifest] })
    expect(custom.written).toEqual(['custom-type'])
  })

  it('lets a custom manifest override a built-in by matching first', async () => {
    const custom = makeCustom()
    custom.match = (filepath: string) => filepath.endsWith('package.json')
    await loadPackage('package.json', { manifests: [custom as unknown as Manifest] }, () => true)
    expect(custom.loaded).toEqual(['package.json'])
  })
})
