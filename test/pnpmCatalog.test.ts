import type { CheckOptions, PnpmWorkspaceMeta } from '../src'
import process from 'node:process'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { parse, parseDocument, stringify } from 'yaml'
import { CheckPackages } from '../src'
import * as pnpmWorkspaces from '../src/io/pnpmWorkspaces'

it('pnpm catalog', async () => {
  const options: CheckOptions = {
    cwd: `${process.cwd()}/test/fixtures/pnpm-catalog`,
  }
  const result = await CheckPackages(options, {})

  expect(result.packages.map(p => p.name)).toMatchInlineSnapshot(`
    [
      "catalog:default",
      "catalog:react17",
      "catalog:react18",
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
        "name": "catalog:default",
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
        "name": "catalog:react17",
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
        "name": "catalog:react18",
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

describe('pnpm catalog updates', async () => {
  // stringified yaml output that should be
  // written to the pnpm-workspace.yaml file
  let output: string | undefined
  beforeAll(() => {
    // mock fn writeYaml
    vi.spyOn(pnpmWorkspaces, 'writeYaml').mockImplementation((_pkg: PnpmWorkspaceMeta, contents: any) => {
      return Promise.resolve().then(() => {
        output = stringify(contents)
      })
    })
  })

  afterAll(() => {
    // @ts-expect-error we mocked it in `beforeAll` hook
    pnpmWorkspaces.writeYaml.mockRestore()
  })

  it('pnpm catalog updates should preserve yaml anchors and aliases with single string value, when anchor is defined inline', async () => {
  const workspaceYamlContents = `
catalog:
  react: &foo ^18.2.0
  react-dom: *foo
  `
  const document = parseDocument(workspaceYamlContents)
  const pkg: PnpmWorkspaceMeta = {
    name: 'catalog:default',
    resolved: [
      // @ts-expect-error testing purpose
      { name: 'react', targetVersion: '^18.3.1', source: 'pnpm:catalog', update: true, currentVersion: '^18.2.0', diff: 'minor' },
      // @ts-expect-error testing purpose
      { name: 'react-dom', targetVersion: '^18.3.1', source: 'pnpm:catalog', update: true, currentVersion: '^18.2.0', diff: 'minor' },
    ],
    raw: parse(workspaceYamlContents),
    document,
    filepath: '',
    type: 'pnpm-workspace.yaml',
  }
    await pnpmWorkspaces.writePnpmWorkspace(pkg, {})
  expect(output).toMatchInlineSnapshot(`
"catalog:
  react: &foo ^18.3.1
  react-dom: *foo
"`)
  })
})
