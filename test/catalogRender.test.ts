import type { CheckOptions, PackageMeta, ResolvedDepChange } from '../src/types'
import c from 'ansis'
import { describe, expect, it } from 'vitest'
import { renderChanges } from '../src/commands/check/render'

function makePkg(name: string, resolved: ResolvedDepChange[] = []): PackageMeta {
  return {
    name,
    private: false,
    version: '1.0.0',
    type: 'package.json',
    relative: 'package.json',
    filepath: '/tmp/package.json',
    raw: {},
    deps: [],
    resolved,
  }
}

function makeChange(depName: string, source: string): ResolvedDepChange {
  return {
    name: depName,
    currentVersion: '^1.0.0',
    targetVersion: '^2.0.0',
    source: source as any,
    update: true,
    diff: 'major',
    pkgData: {} as any,
    resolveError: null,
    provenanceDowngraded: false,
  }
}

describe('catalog display name consistency', () => {
  const options: CheckOptions = { all: false }

  it('should style pnpm-catalog: with dim prefix and yellow name', () => {
    const pkg = makePkg('pnpm-catalog:default', [makeChange('react', 'pnpm-workspace')])
    const { lines } = renderChanges(pkg, options)
    const headerLine = lines[0]

    // Should contain dim prefix and yellow name
    expect(headerLine).toContain(c.dim('pnpm-catalog:'))
    expect(headerLine).toContain(c.yellow('default'))
    // Should NOT use plain cyan
    expect(headerLine).not.toContain(c.cyan('pnpm-catalog:default'))
  })

  it('should style bun-catalog: with dim prefix and yellow name', () => {
    const pkg = makePkg('bun-catalog:default', [makeChange('react', 'bun-workspace')])
    const { lines } = renderChanges(pkg, options)
    const headerLine = lines[0]

    // Should contain dim prefix and yellow name (same treatment as pnpm)
    expect(headerLine).toContain(c.dim('bun-catalog:'))
    expect(headerLine).toContain(c.yellow('default'))
    // Should NOT use plain cyan
    expect(headerLine).not.toContain(c.cyan('bun-catalog:default'))
  })

  it('should style yarn-catalog: with dim prefix and yellow name', () => {
    const pkg = makePkg('yarn-catalog:default', [makeChange('react', 'yarn-workspace')])
    const { lines } = renderChanges(pkg, options)
    const headerLine = lines[0]

    // Should contain dim prefix and yellow name (same treatment as pnpm)
    expect(headerLine).toContain(c.dim('yarn-catalog:'))
    expect(headerLine).toContain(c.yellow('default'))
    // Should NOT use plain cyan
    expect(headerLine).not.toContain(c.cyan('yarn-catalog:default'))
  })

  it('should style named catalogs correctly for all managers', () => {
    for (const prefix of ['pnpm-catalog:', 'bun-catalog:', 'yarn-catalog:']) {
      const catalogName = 'react17'
      const source = prefix.replace('-catalog:', '-workspace')
      const pkg = makePkg(`${prefix}${catalogName}`, [makeChange('react', source)])
      const { lines } = renderChanges(pkg, options)
      const headerLine = lines[0]

      expect(headerLine).toContain(c.dim(prefix))
      expect(headerLine).toContain(c.yellow(catalogName))
    }
  })

  it('should use cyan for regular package names', () => {
    const pkg = makePkg('@my/package', [makeChange('react', 'dependencies')])
    const { lines } = renderChanges(pkg, options)
    const headerLine = lines[0]

    expect(headerLine).toContain(c.cyan('@my/package'))
  })

  it('should use filepath fallback for unnamed packages', () => {
    const pkg = makePkg('', [makeChange('react', 'dependencies')])
    pkg.name = undefined as any
    const { lines } = renderChanges(pkg, options)
    const headerLine = lines[0]

    expect(headerLine).toContain(c.red('›'))
  })
})
