import type { CheckOptions, PackageJsonMeta, ResolvedDepChange } from '../src/types'
import { describe, expect, it } from 'vitest'
import { getJsonOutput } from '../src/commands/check/render'

function createChange(overrides: Partial<ResolvedDepChange>): ResolvedDepChange {
  return {
    name: 'dep',
    currentVersion: '^1.0.0',
    source: 'dependencies',
    update: false,
    targetVersion: '^1.0.0',
    provenanceDowngraded: false,
    diff: null,
    pkgData: { tags: {}, versions: [] },
    ...overrides,
  }
}

function createPackage(resolved: ResolvedDepChange[], name = 'pkg'): PackageJsonMeta {
  return {
    name,
    private: true,
    version: '1.0.0',
    filepath: '/tmp/pkg/package.json',
    relative: 'package.json',
    type: 'package.json',
    raw: {},
    deps: [],
    resolved,
  }
}

describe('getJsonOutput', () => {
  it('only includes dependencies with updates by default', () => {
    const pkg = createPackage([
      createChange({ name: 'axios', update: true, targetVersion: '^2.0.0', diff: 'major' }),
      createChange({ name: 'lodash', update: false }),
    ])

    const output = getJsonOutput([pkg], { all: false } as CheckOptions)

    expect(output.packages).toHaveLength(1)
    expect(output.packages[0].resolved.map(r => r.name)).toEqual(['axios'])
    expect(output.packages[0].resolved[0]).toMatchObject({
      name: 'axios',
      source: 'dependencies',
      currentVersion: '^1.0.0',
      targetVersion: '^2.0.0',
      diff: 'major',
      update: true,
    })
  })

  it('includes all dependencies when `all` is set', () => {
    const pkg = createPackage([
      createChange({ name: 'axios', update: true, targetVersion: '^2.0.0', diff: 'major' }),
      createChange({ name: 'lodash', update: false }),
    ])

    const output = getJsonOutput([pkg], { all: true } as CheckOptions)

    expect(output.packages[0].resolved.map(r => r.name)).toEqual(['axios', 'lodash'])
  })

  it('strips ANSI control characters from package names', () => {
    const pkg = createPackage(
      [createChange({ name: 'axios', update: true, targetVersion: '^2.0.0', diff: 'major' })],
      '\u001B[31mnpm\u001B[39m (global)',
    )

    const output = getJsonOutput([pkg], {} as CheckOptions)

    expect(output.packages[0].name).toBe('npm (global)')
  })

  it('serializes resolve errors and optional fields', () => {
    const pkg = createPackage([
      createChange({
        name: 'broken',
        update: false,
        resolveError: '404',
        aliasName: 'broken-alias',
      }),
    ])

    const output = getJsonOutput([pkg], { all: true } as CheckOptions)

    expect(output.packages[0].resolved[0]).toMatchObject({
      name: 'broken',
      aliasName: 'broken-alias',
      error: '404',
    })
  })

  it('produces valid JSON-serializable output', () => {
    const pkg = createPackage([
      createChange({ name: 'axios', update: true, targetVersion: '^2.0.0', diff: 'major' }),
    ])

    const output = getJsonOutput([pkg], {} as CheckOptions)

    expect(() => JSON.stringify(output)).not.toThrow()
  })
})
