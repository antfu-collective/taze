import { describe, expect, it } from 'vitest'
import { parseDependencies } from '../src/io/dependencies'

describe('parseDependencies', () => {
  it('parse package `dependencies`', () => {
    const myPackage = {
      name: '@taze/package1',
      private: true,
      dependencies: {
        '@taze/not-exists': '^4.13.19',
        '@typescript/lib-dom': 'npm:@types/web@^0.0.80',
      },
    }
    const result = parseDependencies(myPackage, 'dependencies', () => true)
    expect(result).toMatchInlineSnapshot(`
        [
          {
            "currentVersion": "^4.13.19",
            "name": "@taze/not-exists",
            "parents": [],
            "source": "dependencies",
            "update": true,
          },
          {
            "currentVersion": "npm:@types/web@^0.0.80",
            "name": "@typescript/lib-dom",
            "parents": [],
            "source": "dependencies",
            "update": true,
          },
        ]
      `)
  })

  it('parse package `devDependencies`', () => {
    const myPackage = {
      name: '@taze/package1',
      private: true,
      devDependencies: {
        '@taze/not-exists': '^4.13.19',
        '@typescript/lib-dom': 'npm:@types/web@^0.0.80',
      },
    }
    const result = parseDependencies(myPackage, 'devDependencies', () => true)
    expect(result).toMatchInlineSnapshot(`
        [
          {
            "currentVersion": "^4.13.19",
            "name": "@taze/not-exists",
            "parents": [],
            "source": "devDependencies",
            "update": true,
          },
          {
            "currentVersion": "npm:@types/web@^0.0.80",
            "name": "@typescript/lib-dom",
            "parents": [],
            "source": "devDependencies",
            "update": true,
          },
        ]
      `)
  })

  it('parse package `pnpm.overrides`', () => {
    const myPackage = {
      name: '@taze/package1',
      private: true,
      pnpm: {
        overrides: {
          '@taze/not-exists': '^4.13.19',
          '@typescript/lib-dom': 'npm:@types/web@^0.0.80',
        },
      },
    }
    const result = parseDependencies(myPackage, 'pnpm.overrides', () => true)
    expect(result).toMatchInlineSnapshot(`
        [
          {
            "currentVersion": "^4.13.19",
            "name": "@taze/not-exists",
            "parents": [],
            "source": "pnpm.overrides",
            "update": true,
          },
          {
            "currentVersion": "npm:@types/web@^0.0.80",
            "name": "@typescript/lib-dom",
            "parents": [],
            "source": "pnpm.overrides",
            "update": true,
          },
        ]
      `)
  })

  it('parse package `resolutions`', () => {
    const myPackage = {
      name: '@taze/package1',
      private: true,
      resolutions: {
        '@taze/not-exists': '^4.13.19',
        '@typescript/lib-dom': 'npm:@types/web@^0.0.80',
        '@taze/pkg/@taze/nested-foo': '^1.0.0',
        '@taze/pkg/@taze/nested-foo@2.0.0': '^1.0.0',
      },
    }
    const result = parseDependencies(myPackage, 'resolutions', () => true)
    expect(result).toMatchInlineSnapshot(`
        [
          {
            "currentVersion": "^4.13.19",
            "name": "@taze/not-exists",
            "parents": [],
            "source": "resolutions",
            "update": true,
          },
          {
            "currentVersion": "npm:@types/web@^0.0.80",
            "name": "@typescript/lib-dom",
            "parents": [],
            "source": "resolutions",
            "update": true,
          },
          {
            "currentVersion": "^1.0.0",
            "name": "@taze/pkg/@taze/nested-foo",
            "parents": [],
            "source": "resolutions",
            "update": true,
          },
          {
            "currentVersion": "^1.0.0",
            "name": "@taze/pkg/@taze/nested-foo@2.0.0",
            "parents": [],
            "source": "resolutions",
            "update": true,
          },
        ]
      `)
  })

  it('parse package `overrides`', () => {
    const myPackage = {
      name: '@taze/package1',
      private: true,
      overrides: {
        '@taze/not-exists': '^4.13.19',
        '@typescript/lib-dom': 'npm:@types/web@^0.0.80',
        '@taze/pkg': {
          '@taze/nested-foo': '^1.0.0',
          '@taze/nested-bar': {
            '@taze/nested-lvl2': 'npm:@taze/override',
          },
        },
      },
    }
    const result = parseDependencies(myPackage, 'overrides', () => true)
    expect(result).toMatchInlineSnapshot(`
        [
          {
            "currentVersion": "^4.13.19",
            "name": "@taze/not-exists",
            "parents": [],
            "source": "overrides",
            "update": true,
          },
          {
            "currentVersion": "npm:@types/web@^0.0.80",
            "name": "@typescript/lib-dom",
            "parents": [],
            "source": "overrides",
            "update": true,
          },
          {
            "currentVersion": "^1.0.0",
            "name": "@taze/nested-foo",
            "parents": [
              "@taze/pkg",
            ],
            "source": "overrides",
            "update": true,
          },
          {
            "currentVersion": "npm:@taze/override",
            "name": "@taze/nested-lvl2",
            "parents": [
              "@taze/pkg",
              "@taze/nested-bar",
            ],
            "source": "overrides",
            "update": true,
          },
        ]
      `)
  })
})
