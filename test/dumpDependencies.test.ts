import type { DepType, ResolvedDepChange } from '../src/types'
import { describe, expect, it } from 'vitest'
import { dumpDependencies } from '../src/manifests/dependencies'

describe('dumpDependencies', () => {
  function makeDepChange(source: DepType, override: Partial<ResolvedDepChange> = {}) {
    return {
      name: '@types/semver',
      currentVersion: '^7.3.10',
      source,
      update: true,
      targetVersion: '^7.3.12',
      diff: 'patch',
      ...override,
    } as ResolvedDepChange
  }

  it('dump `dependencies` type', () => {
    const dump = dumpDependencies([makeDepChange('dependencies')], 'dependencies')
    expect(dump).toMatchInlineSnapshot(`
      {
        "@types/semver": "^7.3.12",
      }
    `)
  })
  it('dump `devDependencies` type', () => {
    const dump = dumpDependencies([makeDepChange('devDependencies')], 'devDependencies')
    expect(dump).toMatchInlineSnapshot(`
      {
        "@types/semver": "^7.3.12",
      }
    `)
  })
  it('dump `pnpm.overrides` type', () => {
    const dump = dumpDependencies([makeDepChange('pnpm.overrides')], 'pnpm.overrides')
    expect(dump).toMatchInlineSnapshot(`
      {
        "@types/semver": "^7.3.12",
      }
    `)
  })

  it('dump `resolutions` type', () => {
    const dump = dumpDependencies([
      makeDepChange('resolutions'),
      makeDepChange('resolutions', {
        name: '@taze/pkg/@taze/nested-foo',
        targetVersion: '^1.0.0',
      }),
      makeDepChange('resolutions', {
        name: '@taze/pkg/@taze/nested-bar@2.0.0',
        targetVersion: '^2.0.0',
      }),
    ], 'resolutions')
    expect(dump).toMatchInlineSnapshot(`
      {
        "@taze/pkg/@taze/nested-bar@2.0.0": "^2.0.0",
        "@taze/pkg/@taze/nested-foo": "^1.0.0",
        "@types/semver": "^7.3.12",
      }
    `)
  })

  it('dump `overrides` type', () => {
    const dump = dumpDependencies([
      makeDepChange('overrides', {
        name: '@taze/nested-foo',
        parents: ['@taze/pkg'],
        targetVersion: '^1.0.0',
      }),
      makeDepChange('overrides', {
        name: '@taze/nested-lvl2',
        targetVersion: '^2.0.0',
        parents: [
          '@taze/pkg',
          '@taze/nested-bar',
        ],
      }),
    ], 'overrides')

    expect(dump).toMatchInlineSnapshot(`
      {
        "@taze/pkg": {
          "@taze/nested-bar": {
            "@taze/nested-lvl2": "^2.0.0",
          },
          "@taze/nested-foo": "^1.0.0",
        },
      }
    `)
  })

  it('dump sorted by key', () => {
    const dump = dumpDependencies([
      makeDepChange('dependencies', { name: 'd', aliasName: 'a' }),
      makeDepChange('dependencies', { name: 'c' }),
      makeDepChange('dependencies', { name: 'b' }),
    ], 'dependencies')
    expect(Object.keys(dump)).toEqual(['a', 'b', 'c'],
    )
  })

  it('dump sorted by key in code point order', () => {
    // `jsonc/sort-keys` compares keys by code point, not with `localeCompare`
    const dump = dumpDependencies([
      makeDepChange('dependencies', { name: 'date-fns' }),
      makeDepChange('dependencies', { name: 'fast_array_intersect' }),
      makeDepChange('dependencies', { name: '@vueuse/core' }),
      makeDepChange('dependencies', { name: 'fast-xml-parser' }),
      makeDepChange('dependencies', { name: '3dmol' }),
      makeDepChange('dependencies', { name: 'fast-equals' }),
      makeDepChange('dependencies', { name: '@atomistics/xyz' }),
    ], 'dependencies')
    expect(Object.keys(dump)).toEqual([
      '3dmol',
      '@atomistics/xyz',
      '@vueuse/core',
      'date-fns',
      'fast-equals',
      'fast-xml-parser',
      'fast_array_intersect',
    ])
  })
})
