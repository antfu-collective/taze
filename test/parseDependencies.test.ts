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
            "source": "dependencies",
            "update": true,
          },
          {
            "currentVersion": "npm:@types/web@^0.0.80",
            "name": "@typescript/lib-dom",
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
            "source": "devDependencies",
            "update": true,
          },
          {
            "currentVersion": "npm:@types/web@^0.0.80",
            "name": "@typescript/lib-dom",
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
            "source": "pnpm.overrides",
            "update": true,
          },
          {
            "currentVersion": "npm:@types/web@^0.0.80",
            "name": "@typescript/lib-dom",
            "source": "pnpm.overrides",
            "update": true,
          },
        ]
      `)
  })
})
