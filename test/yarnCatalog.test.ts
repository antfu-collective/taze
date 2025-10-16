import type { CheckOptions, YarnWorkspaceMeta } from '../src'
import process from 'node:process'
import { parsePnpmWorkspaceYaml } from 'pnpm-workspace-yaml'
import { afterEach, beforeEach, describe, expect, it, vi, vitest } from 'vitest'
import { CheckPackages } from '../src'
import * as yarnWorkspaces from '../src/io/yarnWorkspaces'

// output that should be written to the .yarnrc.yml file
let output: string | undefined
vi.mock('node:fs/promises', async (importActual) => {
  return {
    ...await importActual(),
    writeFile(_path: string, data: any) {
      output = data.toString()
      return Promise.resolve()
    },
  }
})

beforeEach(() => {
  output = undefined
})

afterEach(() => {
  vitest.restoreAllMocks()
})

it('yarn catalog', async () => {
  const options: CheckOptions = {
    cwd: `${process.cwd()}/test/fixtures/yarn-catalog`,
  }
  const result = await CheckPackages(options, {})

  expect(result.packages.map(p => p.name)).toMatchInlineSnapshot(`
    [
      "yarn-catalog:default",
      "yarn-catalog:react17",
      "yarn-catalog:react18",
      "@taze/monorepo-example",
    ]
  `)

  expect(
    result.packages.flatMap(p => ({
      name: p.name,
      packages: p.resolved.map(r => [r.name, r.targetVersion]),
    })),
  ).toMatchInlineSnapshot(`
    [
      {
        "name": "yarn-catalog:default",
        "packages": [
          [
            "react",
            "^18.2.0",
          ],
          [
            "react-dom",
            "^18.2.0",
          ],
        ],
      },
      {
        "name": "yarn-catalog:react17",
        "packages": [
          [
            "react",
            "^17.0.2",
          ],
          [
            "react-dom",
            "^17.0.2",
          ],
        ],
      },
      {
        "name": "yarn-catalog:react18",
        "packages": [
          [
            "react",
            "^18.2.0",
          ],
          [
            "react-dom",
            "^18.2.0",
          ],
        ],
      },
      {
        "name": "@taze/monorepo-example",
        "packages": [
          [
            "express",
            "4.12.x",
          ],
          [
            "lodash",
            "^4.13.19",
          ],
          [
            "multer",
            "^0.1.8",
          ],
          [
            "react-bootstrap",
            "^0.22.6",
          ],
          [
            "webpack",
            "~1.9.10",
          ],
          [
            "@types/lodash",
            "^4.14.0",
          ],
          [
            "typescript",
            "3.5",
          ],
        ],
      },
    ]
  `)
})

describe('yarn catalog update w/ yaml anchors and aliases', () => {
  it('should preserve yaml anchors and aliases with single string value, when anchor is defined inline', async () => {
    const workspaceYamlContents = `
    catalog:
      react: &foo ^18.2.0
      react-dom: *foo
      `
    const context = parsePnpmWorkspaceYaml(workspaceYamlContents)
    const pkg: YarnWorkspaceMeta = {
      type: '.yarnrc.yml',
      name: 'yarn-catalog:default',
      resolved: [
        // testing purpose
        { name: 'react', targetVersion: '^18.3.1', source: 'yarn-workspace', update: true, currentVersion: '^18.2.0', diff: 'minor' } as any,
        // testing purpose
        { name: 'react-dom', targetVersion: '^18.3.1', source: 'yarn-workspace', update: true, currentVersion: '^18.2.0', diff: 'minor' } as any,
      ],
      raw: context.toJSON(),
      context,
      filepath: '/tmp/.yarnrc.yml',
      private: false,
      version: '',
      relative: '',
      deps: [],
    }
    await yarnWorkspaces.writeYarnWorkspace(pkg, {})

    expect(output).toMatchInlineSnapshot(`
      "catalog:
        react: &foo ^18.3.1
        react-dom: *foo
      "
    `)
  })

  it('should preserve yaml anchors and aliases with single string value, when anchor is defined in a separate field', async () => {
    const workspaceYamlContents = `
    defines:
      - &react ^18.2.0

    catalog:
      react: *react
      react-dom: *react
      `
    const context = parsePnpmWorkspaceYaml(workspaceYamlContents)
    const pkg: YarnWorkspaceMeta = {
      name: 'yarn-catalog:default',
      resolved: [
        // testing purpose
        { name: 'react', targetVersion: '^18.3.1', source: 'yarn-workspace', update: true, currentVersion: '^18.2.0', diff: 'minor' } as any,
        // testing purpose
        { name: 'react-dom', targetVersion: '^18.3.1', source: 'yarn-workspace', update: true, currentVersion: '^18.2.0', diff: 'minor' } as any,
      ],
      raw: context.toJSON(),
      context,
      filepath: '/tmp/.yarnrc.yml',
      type: '.yarnrc.yml',
      private: false,
      version: '',
      relative: '',
      deps: [],
    }
    await yarnWorkspaces.writeYarnWorkspace(pkg, {})
    expect(output).toMatchInlineSnapshot(`
      "defines:
        - &react ^18.3.1

      catalog:
        react: *react
        react-dom: *react
      "
    `)
  })
})
