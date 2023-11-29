import { describe, expect, it } from 'vitest'
import { dumpDependencies } from '../src/io/dependencies'
import type { DepType, ResolvedDepChange } from '../src/types'

describe('dumpDependencies', () => {
  function getPackageBySource(source: DepType) {
    return {
      name: '@types/semver',
      currentVersion: '^7.3.10',
      source,
      update: true,
      targetVersion: '^7.3.12',
      diff: 'patch',
    } as ResolvedDepChange
  }

  it('dump `dependencies` type', () => {
    const dump = dumpDependencies([getPackageBySource('dependencies')], 'dependencies')
    expect(dump).toMatchInlineSnapshot(`
      {
        "@types/semver": "^7.3.12",
      }
    `)
  })
  it('dump `devDependencies` type', () => {
    const dump = dumpDependencies([getPackageBySource('devDependencies')], 'devDependencies')
    expect(dump).toMatchInlineSnapshot(`
      {
        "@types/semver": "^7.3.12",
      }
    `)
  })
  it('dump `pnpm.overrides` type', () => {
    const dump = dumpDependencies([getPackageBySource('pnpm.overrides')], 'pnpm.overrides')
    expect(dump).toMatchInlineSnapshot(`
      {
        "@types/semver": "^7.3.12",
      }
    `)
  })

  it('dump `resolutions` type', () => {
    const dump = dumpDependencies([getPackageBySource('resolutions')], 'resolutions')
    expect(dump).toMatchInlineSnapshot(`
      {
        "@types/semver": "^7.3.12",
      }
    `)
  })

  it('dump `overrides` type', () => {
    const dump = dumpDependencies([getPackageBySource('overrides')], 'overrides')
    expect(dump).toMatchInlineSnapshot(`
      {
        "@types/semver": "^7.3.12",
      }
    `)
  })
})
