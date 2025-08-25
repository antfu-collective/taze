import { describe, expect, it, vi } from 'vitest'
import { parseDependencies, dumpDependencies } from '../src/io/dependencies'
import { resolveDependency } from '../src/io/resolves'
import * as packument from '../src/utils/packument'

vi.mock('../src/utils/packument')

describe('jsr', () => {
  it('should parse jsr dependencies', () => {
    const pkg = {
      dependencies: {
        '@hono/hono': 'jsr:@hono/hono@^4.0.0',
      },
    }
    const deps = parseDependencies(pkg, 'dependencies', () => true)
    expect(deps).toMatchInlineSnapshot(`
      [
        {
          "currentVersion": "jsr:@hono/hono@^4.0.0",
          "name": "@hono/hono",
          "parents": [],
          "source": "dependencies",
          "update": true,
        },
      ]
    `)
  })

  it('should resolve jsr dependencies', async () => {
    vi.mocked(packument.fetchPackage).mockResolvedValue({
      versions: ['4.0.0', '4.0.1', '4.1.0'],
      tags: { latest: '4.1.0' },
    })

    const dep = {
      name: '@hono/hono',
      currentVersion: 'jsr:@hono/hono@4.0.0',
      source: 'dependencies' as const,
      update: true,
    }

    const resolved = await resolveDependency(dep, { mode: 'latest', includeLocked: true })

    expect(resolved.targetVersion).toBe('4.1.0')
    expect(resolved.protocol).toBe('jsr')
  })

  it('should dump jsr dependencies', () => {
    const deps = [
      {
        name: '@hono/hono',
        aliasName: '@hono/hono',
        currentVersion: '^4.0.0',
        targetVersion: '4.1.0',
        source: 'dependencies' as const,
        protocol: 'jsr' as const,
        update: true,
        diff: 'minor',
        pkgData: { versions: [], tags: {} },
        resolveError: null,
        provenanceDowngraded: false,
      },
    ]

    const dumped = dumpDependencies(deps, 'dependencies')

    expect(dumped).toMatchInlineSnapshot(`
      {
        "@hono/hono": "jsr:@hono/hono@4.1.0",
      }
    `)
  })
})
