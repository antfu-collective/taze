import { describe, expect, it } from 'vitest'
import { parseDependencies } from '../src/io/dependencies'
import { isLocalPackage, isUrlPackage } from '../src/io/resolves'

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

  it('parse package `dependencies` should exclude URL version', () => {
    const myPackage = {
      name: '@taze/package1',
      private: true,
      dependencies: {
        '@taze/not-exists': '^4.13.19',
        '@typescript/lib-dom': 'npm:@types/web@^0.0.80',
        'my-lib1': 'https://example.com/packages/my-lib1-1.0.0.tgz',
        'my-lib2': 'git+https://github.com/user/my-lib2.git',
        'my-lib3': 'github:user/my-lib3#v1.2.3',
        'my-lib4': 'file:../my-lib4',
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
        {
          "currentVersion": "https://example.com/packages/my-lib1-1.0.0.tgz",
          "name": "my-lib1",
          "parents": [],
          "source": "dependencies",
          "update": true,
        },
        {
          "currentVersion": "git+https://github.com/user/my-lib2.git",
          "name": "my-lib2",
          "parents": [],
          "source": "dependencies",
          "update": true,
        },
        {
          "currentVersion": "github:user/my-lib3#v1.2.3",
          "name": "my-lib3",
          "parents": [],
          "source": "dependencies",
          "update": true,
        },
        {
          "currentVersion": "file:../my-lib4",
          "name": "my-lib4",
          "parents": [],
          "source": "dependencies",
          "update": true,
        },
      ]
    `)

    expect(
      result
        .filter(i => !isUrlPackage(i.currentVersion) && !isLocalPackage(i.currentVersion)),
    ).toMatchInlineSnapshot(`
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

  it('parse package `peerDependencies`', () => {
    const myPackage = {
      name: '@taze/package1',
      private: true,
      peerDependencies: {
        '@taze/not-exists': '^4.13.19',
        '@typescript/lib-dom': 'npm:@types/web@^0.0.80',
      },
    }
    const result = parseDependencies(myPackage, 'peerDependencies', () => true)
    expect(result).toMatchInlineSnapshot(`
      [
        {
          "currentVersion": "^4.13.19",
          "name": "@taze/not-exists",
          "parents": [],
          "source": "peerDependencies",
          "update": true,
        },
        {
          "currentVersion": "npm:@types/web@^0.0.80",
          "name": "@typescript/lib-dom",
          "parents": [],
          "source": "peerDependencies",
          "update": true,
        },
      ]
    `)
  })
})
