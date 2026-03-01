import type { BunWorkspaceMeta, PackageMeta } from '../src/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { writeBunWorkspace } from '../src/io/bunWorkspaces'
import { writePackageJSON } from '../src/io/packageJson'

// Track all writes by filepath so we can inspect the final file state
const writes: Record<string, string> = {}
let lastOutput: string | undefined

vi.mock('node:fs/promises', async (importActual) => {
  return {
    ...await importActual(),
    writeFile(_path: string, data: string) {
      const str = data.toString()
      writes[_path] = str
      lastOutput = str
      return Promise.resolve()
    },
  }
})

// Mock writeJSON from packages.ts so writePackageJSON doesn't hit real fs
// (packages.ts uses `node:fs` internally which the above mock doesn't cover)
vi.mock('../src/io/packages', async (importActual) => {
  const actual = await importActual() as any
  return {
    ...actual,
    writeJSON: vi.fn(async (_filepath: string, _data: Record<string, unknown>) => {
      // Simulate what real writeJSON does: write the data as JSON
      const content = JSON.stringify(_data, null, 2)
      writes[_filepath] = `${content}\n`
      lastOutput = `${content}\n`
    }),
  }
})

beforeEach(() => {
  lastOutput = undefined
  Object.keys(writes).forEach(k => delete writes[k])
})

describe('bun catalog write clobber regression', () => {
  it('should not clobber catalog changes when writePackageJSON runs after writeBunWorkspace (shared raw)', async () => {
    // Simulate what loadPackage() now does: ONE shared raw object for both writers
    const raw: Record<string, any> = {
      name: '@test/bun-workspace',
      workspaces: {
        catalog: {
          'react': '^18.2.0',
          'react-dom': '^18.2.0',
        },
      },
      dependencies: {
        express: '^4.18.0',
      },
      devDependencies: {
        typescript: '^5.0.0',
      },
    }

    const bunPkg: BunWorkspaceMeta = {
      name: 'bun-catalog:default',
      resolved: [
        { name: 'react', targetVersion: '^19.0.0', source: 'bun-workspace', update: true, currentVersion: '^18.2.0', diff: 'major', pkgData: {}, resolveError: null, provenanceDowngraded: false } as any,
        { name: 'react-dom', targetVersion: '^19.0.0', source: 'bun-workspace', update: true, currentVersion: '^18.2.0', diff: 'major', pkgData: {}, resolveError: null, provenanceDowngraded: false } as any,
      ],
      raw, // SHARED reference
      filepath: '/tmp/test-clobber/package.json',
      type: 'bun-workspace',
      private: true,
      version: '',
      relative: 'package.json',
      deps: [],
    }

    const jsonPkg: PackageMeta = {
      name: '@test/bun-workspace',
      resolved: [
        { name: 'express', targetVersion: '^5.0.0', source: 'dependencies', update: true, currentVersion: '^4.18.0', diff: 'major', pkgData: {}, resolveError: null, provenanceDowngraded: false } as any,
        { name: 'typescript', targetVersion: '^5.7.0', source: 'devDependencies', update: true, currentVersion: '^5.0.0', diff: 'minor', pkgData: {}, resolveError: null, provenanceDowngraded: false } as any,
      ],
      raw, // SAME shared reference — this is the fix
      filepath: '/tmp/test-clobber/package.json',
      type: 'package.json',
      private: true,
      version: '1.0.0',
      relative: 'package.json',
      deps: [],
    }

    // Execute writes in same order as taze: bun catalog first, then package.json
    await writeBunWorkspace(bunPkg, {})
    await writePackageJSON(jsonPkg, {})

    // The shared raw object should contain ALL changes
    expect(raw.workspaces.catalog.react).toBe('^19.0.0')
    expect(raw.workspaces.catalog['react-dom']).toBe('^19.0.0')
    expect(raw.dependencies.express).toBe('^5.0.0')
    expect(raw.devDependencies.typescript).toBe('^5.7.0')

    // The last file written should contain ALL changes (not just the last writer's)
    const written = JSON.parse(lastOutput!)
    expect(written.workspaces.catalog.react).toBe('^19.0.0')
    expect(written.workspaces.catalog['react-dom']).toBe('^19.0.0')
    expect(written.dependencies.express).toBe('^5.0.0')
    expect(written.devDependencies.typescript).toBe('^5.7.0')
  })

  it('should demonstrate clobber would occur with independent raw objects (old behavior)', async () => {
    // This test proves WHY the shared raw fix matters
    // With independent copies (old behavior), the second writer would overwrite the first

    const raw_A: Record<string, any> = {
      name: '@test/bun-workspace',
      workspaces: {
        catalog: { react: '^18.2.0' },
      },
      dependencies: { express: '^4.18.0' },
    }

    // Simulate old behavior: independent copy (different object, same initial data)
    const raw_B: Record<string, any> = JSON.parse(JSON.stringify(raw_A))

    // Verify they are independent
    expect(raw_A).not.toBe(raw_B)
    expect(raw_A).toEqual(raw_B)

    const bunPkg: BunWorkspaceMeta = {
      name: 'bun-catalog:default',
      resolved: [
        { name: 'react', targetVersion: '^19.0.0', source: 'bun-workspace', update: true, currentVersion: '^18.2.0', diff: 'major', pkgData: {}, resolveError: null, provenanceDowngraded: false } as any,
      ],
      raw: raw_A, // Writer A gets raw_A
      filepath: '/tmp/test-clobber/package.json',
      type: 'bun-workspace',
      private: true,
      version: '',
      relative: 'package.json',
      deps: [],
    }

    const jsonPkg: PackageMeta = {
      name: '@test/bun-workspace',
      resolved: [
        { name: 'express', targetVersion: '^5.0.0', source: 'dependencies', update: true, currentVersion: '^4.18.0', diff: 'major', pkgData: {}, resolveError: null, provenanceDowngraded: false } as any,
      ],
      raw: raw_B, // Writer B gets raw_B (INDEPENDENT — the old bug)
      filepath: '/tmp/test-clobber/package.json',
      type: 'package.json',
      private: true,
      version: '1.0.0',
      relative: 'package.json',
      deps: [],
    }

    await writeBunWorkspace(bunPkg, {})
    await writePackageJSON(jsonPkg, {})

    // raw_A has catalog changes but NOT the dependency changes
    expect(raw_A.workspaces.catalog.react).toBe('^19.0.0')
    expect(raw_A.dependencies.express).toBe('^4.18.0') // stale!

    // raw_B has dependency changes but NOT the catalog changes
    expect(raw_B.workspaces.catalog.react).toBe('^18.2.0') // stale!
    expect(raw_B.dependencies.express).toBe('^5.0.0')

    // The last file written (by writePackageJSON) would have raw_B — catalog LOST
    const written = JSON.parse(lastOutput!)
    expect(written.workspaces.catalog.react).toBe('^18.2.0') // CLOBBERED!
    expect(written.dependencies.express).toBe('^5.0.0')
  })

  it('should preserve all catalogs when updating one catalog with shared raw', async () => {
    const raw: Record<string, any> = {
      name: '@test/bun-workspace',
      workspaces: {
        catalog: {
          'react': '^18.2.0',
          'react-dom': '^18.2.0',
        },
        catalogs: {
          react17: { 'react': '^17.0.2', 'react-dom': '^17.0.2' },
          react18: { 'react': '^18.2.0', 'react-dom': '^18.2.0' },
        },
      },
      dependencies: { express: '^4.18.0' },
    }

    const bunDefaultPkg: BunWorkspaceMeta = {
      name: 'bun-catalog:default',
      resolved: [
        { name: 'react', targetVersion: '^19.0.0', source: 'bun-workspace', update: true, currentVersion: '^18.2.0', diff: 'major', pkgData: {}, resolveError: null, provenanceDowngraded: false } as any,
      ],
      raw,
      filepath: '/tmp/test-clobber/package.json',
      type: 'bun-workspace',
      private: true,
      version: '',
      relative: 'package.json',
      deps: [],
    }

    const bunReact17Pkg: BunWorkspaceMeta = {
      name: 'bun-catalog:react17',
      resolved: [
        { name: 'react', targetVersion: '^17.0.3', source: 'bun-workspace', update: true, currentVersion: '^17.0.2', diff: 'patch', pkgData: {}, resolveError: null, provenanceDowngraded: false } as any,
      ],
      raw,
      filepath: '/tmp/test-clobber/package.json',
      type: 'bun-workspace',
      private: true,
      version: '',
      relative: 'package.json',
      deps: [],
    }

    const jsonPkg: PackageMeta = {
      name: '@test/bun-workspace',
      resolved: [
        { name: 'express', targetVersion: '^5.0.0', source: 'dependencies', update: true, currentVersion: '^4.18.0', diff: 'major', pkgData: {}, resolveError: null, provenanceDowngraded: false } as any,
      ],
      raw,
      filepath: '/tmp/test-clobber/package.json',
      type: 'package.json',
      private: true,
      version: '1.0.0',
      relative: 'package.json',
      deps: [],
    }

    // Write in order: default catalog, named catalog, then package.json
    await writeBunWorkspace(bunDefaultPkg, {})
    await writeBunWorkspace(bunReact17Pkg, {})
    await writePackageJSON(jsonPkg, {})

    // ALL changes should survive in the shared raw
    const written = JSON.parse(lastOutput!)
    expect(written.workspaces.catalog.react).toBe('^19.0.0')
    expect(written.workspaces.catalog['react-dom']).toBe('^18.2.0') // unchanged
    expect(written.workspaces.catalogs.react17.react).toBe('^17.0.3')
    expect(written.workspaces.catalogs.react18.react).toBe('^18.2.0') // untouched
    expect(written.dependencies.express).toBe('^5.0.0')
  })

  it('should handle catalog-only updates (no regular deps to update)', async () => {
    const raw: Record<string, any> = {
      name: '@test/bun-workspace',
      workspaces: {
        catalog: { react: '^18.2.0' },
      },
      dependencies: { express: '^4.18.0' },
    }

    const bunPkg: BunWorkspaceMeta = {
      name: 'bun-catalog:default',
      resolved: [
        { name: 'react', targetVersion: '^19.0.0', source: 'bun-workspace', update: true, currentVersion: '^18.2.0', diff: 'major', pkgData: {}, resolveError: null, provenanceDowngraded: false } as any,
      ],
      raw,
      filepath: '/tmp/test-clobber/package.json',
      type: 'bun-workspace',
      private: true,
      version: '',
      relative: 'package.json',
      deps: [],
    }

    const jsonPkg: PackageMeta = {
      name: '@test/bun-workspace',
      resolved: [
        // express has NO update (update: false)
        { name: 'express', targetVersion: '^4.18.0', source: 'dependencies', update: false, currentVersion: '^4.18.0', diff: null, pkgData: {}, resolveError: null, provenanceDowngraded: false } as any,
      ],
      raw,
      filepath: '/tmp/test-clobber/package.json',
      type: 'package.json',
      private: true,
      version: '1.0.0',
      relative: 'package.json',
      deps: [],
    }

    await writeBunWorkspace(bunPkg, {})
    await writePackageJSON(jsonPkg, {})

    // Catalog should be updated, deps stay the same
    expect(raw.workspaces.catalog.react).toBe('^19.0.0')
    expect(raw.dependencies.express).toBe('^4.18.0')
  })

  it('should handle regular-deps-only updates (no catalog changes)', async () => {
    const raw: Record<string, any> = {
      name: '@test/bun-workspace',
      workspaces: {
        catalog: { react: '^18.2.0' },
      },
      dependencies: { express: '^4.18.0' },
    }

    const bunPkg: BunWorkspaceMeta = {
      name: 'bun-catalog:default',
      resolved: [], // no catalog updates
      raw,
      filepath: '/tmp/test-clobber/package.json',
      type: 'bun-workspace',
      private: true,
      version: '',
      relative: 'package.json',
      deps: [],
    }

    const jsonPkg: PackageMeta = {
      name: '@test/bun-workspace',
      resolved: [
        { name: 'express', targetVersion: '^5.0.0', source: 'dependencies', update: true, currentVersion: '^4.18.0', diff: 'major', pkgData: {}, resolveError: null, provenanceDowngraded: false } as any,
      ],
      raw,
      filepath: '/tmp/test-clobber/package.json',
      type: 'package.json',
      private: true,
      version: '1.0.0',
      relative: 'package.json',
      deps: [],
    }

    await writeBunWorkspace(bunPkg, {})
    await writePackageJSON(jsonPkg, {})

    // Catalog untouched, deps updated
    expect(raw.workspaces.catalog.react).toBe('^18.2.0')
    expect(raw.dependencies.express).toBe('^5.0.0')
  })
})

describe('bun catalog shared raw reference integrity', () => {
  it('loadBunWorkspace and loadPackageJSON should receive the same raw object', async () => {
    // This is a structural test: verify that when both loaders receive the
    // same raw object, the BunWorkspaceMeta and PackageJsonMeta both reference it
    const sharedRaw: Record<string, any> = {
      name: '@test/workspace',
      workspaces: { catalog: { react: '^18.2.0' } },
      dependencies: { express: '^4.18.0' },
    }

    // Simulate what loadPackage does: pass shared raw to both
    const { loadBunWorkspace } = await import('../src/io/bunWorkspaces')

    const bunResult = await loadBunWorkspace(
      'package.json',
      { cwd: '/tmp' },
      () => true,
      sharedRaw,
    )

    // The BunWorkspaceMeta.raw should be the EXACT SAME object (not a copy)
    expect(bunResult[0].raw).toBe(sharedRaw)

    // Mutations to one should be visible through the other
    sharedRaw.testField = 'added'
    expect(bunResult[0].raw.testField).toBe('added')
  })
})
