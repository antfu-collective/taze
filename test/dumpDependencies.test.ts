import { describe, expect, it } from 'vitest'
import { dumpDependencies, setByPath } from '../src/io/dependencies'
import type { ResolvedDepChange } from '../src/types'

describe('dumpDependencies', () => {
  function makeDepChange(source: string, override: Partial<ResolvedDepChange> = {}) {
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

  it('dump `setByPath` with vscode', () => {
    const pkgObj = {
      devDependencies: {
        '@types/vscode': '^1.77.0',
      },
    }
    setByPath(pkgObj, 'devDependencies', {
      '@types/vscode': '^1.91.0',
    })

    expect(pkgObj).toMatchInlineSnapshot(`
      {
        "devDependencies": {
          "@types/vscode": "^1.91.0",
        },
        "engines": {
          "vscode": "^1.91.0",
        },
      }
    `)
  })
})
