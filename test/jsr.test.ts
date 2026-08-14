import type { PackageData, ResolvedDepChange } from '../src/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dumpDependencies, parseDependencies } from '../src/manifests/dependencies'

const { fetchJsrPackageMetaMock, fetchPackageMock } = vi.hoisted(() => ({
  fetchJsrPackageMetaMock: vi.fn(),
  fetchPackageMock: vi.fn(),
}))

vi.mock('../src/utils/packument.ts', () => ({
  fetchJsrPackageMeta: fetchJsrPackageMetaMock,
  fetchPackage: fetchPackageMock,
}))

afterEach(() => {
  vi.resetModules()
  fetchJsrPackageMetaMock.mockReset()
  fetchPackageMock.mockReset()
})

describe('jsr manifest wiring', () => {
  it('routes jsr: specifiers to the jsr package type, others to npm', () => {
    const pkg = {
      dependencies: {
        '@std/cli': 'jsr:^1.0.0',
        'typescript': '^5.0.0',
        '@types/web': 'npm:@types/web@^0.0.80',
      },
    }
    const deps = parseDependencies(pkg, 'dependencies', () => true)
    expect(deps.find(d => d.name === '@std/cli')?.packageType).toBe('jsr')
    expect(deps.find(d => d.name === 'typescript')?.packageType).toBe('npm')
    expect(deps.find(d => d.name === '@types/web')?.packageType).toBe('npm')
  })

  it('writes back the jsr: prefix from the resolved protocol (no alias needed)', () => {
    const dep = {
      name: '@std/cli',
      currentVersion: '^1.0.0',
      source: 'dependencies',
      update: true,
      targetVersion: '^1.0.32',
      diff: 'patch',
      protocol: 'jsr',
    } as ResolvedDepChange
    expect(dumpDependencies([dep], 'dependencies')).toEqual({ '@std/cli': 'jsr:^1.0.32' })
  })
})

describe('jsr registry resolution', () => {
  it('resolves a jsr dependency through the jsr registry without hitting npm', async () => {
    const meta: PackageData = { tags: { latest: '1.0.32' }, versions: ['1.0.0', '1.0.15', '1.0.32'] }
    fetchJsrPackageMetaMock.mockResolvedValue(meta)

    const { resolveDependency } = await import('../src/registries')
    const resolved = await resolveDependency({
      name: '@std/cli',
      currentVersion: 'jsr:^1.0.0',
      source: 'dependencies',
      packageType: 'jsr',
      update: true,
    }, { mode: 'major' })

    expect(resolved.packageType).toBe('jsr')
    expect(resolved.protocol).toBe('jsr')
    // the `jsr:` prefix is stripped off the resolved current version
    expect(resolved.currentVersion).toBe('^1.0.0')
    expect(resolved.targetVersion).toBe('^1.0.32')
    expect(resolved.update).toBe(true)
    expect(fetchJsrPackageMetaMock).toHaveBeenCalledWith('@std/cli', undefined)
    expect(fetchPackageMock).not.toHaveBeenCalled()
  })

  it('surfaces a jsr fetch failure as a resolve error instead of crashing', async () => {
    fetchJsrPackageMetaMock.mockRejectedValue(new Error('Failed to fetch JSR package "@std/nope": 404 Not Found'))

    const { resolveDependency } = await import('../src/registries')
    const resolved = await resolveDependency({
      name: '@std/nope',
      currentVersion: 'jsr:^1.0.0',
      source: 'dependencies',
      packageType: 'jsr',
      update: true,
    }, { mode: 'major' })

    expect(resolved.diff).toBe('error')
    expect(resolved.update).toBe(false)
    expect(String(resolved.resolveError)).toContain('404')
  })
})
