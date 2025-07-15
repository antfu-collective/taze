import type { BunWorkspaceMeta, CheckOptions } from '../src'
import process from 'node:process'
import { afterEach, beforeEach, expect, it, vi, vitest } from 'vitest'
import { CheckPackages } from '../src'
import * as bunWorkspaces from '../src/io/bunWorkspaces'

// output that should be written to the package.json file
let _output: string | undefined
vi.mock('node:fs/promises', async (importActual) => {
  return {
    ...await importActual(),
    writeFile(_path: string, data: any) {
      _output = data.toString()
      return Promise.resolve()
    },
  }
})

beforeEach(() => {
  _output = undefined
})

afterEach(() => {
  vitest.restoreAllMocks()
})

it('bun catalog', async () => {
  const options: CheckOptions = {
    cwd: `${process.cwd()}/test/fixtures/bun-catalog`,
    mode: 'latest',
    write: true,
    recursive: true,
    include: ['react', 'react-dom', 'jest', 'vitest'],
  }

  const result = await CheckPackages(options)
  const packages = result.packages

  expect(packages.map(pkg => pkg.name)).toEqual([
    'bun-catalog:default',
    'bun-catalog:testing',
    'bun-catalog:react17',
    'test-bun-catalog',
    'app',
  ])

  // Check default catalog
  const defaultCatalog = packages.find(pkg => pkg.name === 'bun-catalog:default') as BunWorkspaceMeta
  expect(defaultCatalog).toBeDefined()
  expect(defaultCatalog.type).toBe('bun-workspace')
  expect(defaultCatalog.deps.map(dep => dep.name)).toEqual(['react', 'react-dom'])

  // Check testing catalog
  const testingCatalog = packages.find(pkg => pkg.name === 'bun-catalog:testing') as BunWorkspaceMeta
  expect(testingCatalog).toBeDefined()
  expect(testingCatalog.deps.map(dep => dep.name)).toEqual(['jest', 'vitest'])

  // Check react17 catalog
  const react17Catalog = packages.find(pkg => pkg.name === 'bun-catalog:react17') as BunWorkspaceMeta
  expect(react17Catalog).toBeDefined()
  expect(react17Catalog.deps.map(dep => dep.name)).toEqual(['react', 'react-dom'])
})

it('loadBunWorkspace should parse catalogs correctly', async () => {
  const spy = vi.spyOn(bunWorkspaces, 'loadBunWorkspace')

  const options: CheckOptions = {
    cwd: `${process.cwd()}/test/fixtures/bun-catalog`,
  }

  await CheckPackages(options)

  expect(spy).toHaveBeenCalledWith('package.json', expect.objectContaining({
    cwd: `${process.cwd()}/test/fixtures/bun-catalog`,
  }), expect.any(Function))
})
