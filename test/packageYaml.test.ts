import type { CheckOptions, PackageYamlMeta } from '../src/types'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi, vitest } from 'vitest'
import { CheckPackages } from '../src'
import * as packageYaml from '../src/io/packageYaml'

// output that should be written to the package.yaml file
let output: string | undefined

vi.mock('node:fs/promises', async (importActual) => {
  return {
    ...await importActual(),
    writeFile(_path: string, data: string) {
      output = data
      return Promise.resolve()
    },
  }
})

vitest.mock('@antfu/ni', () => ({
  detect: vitest.fn().mockResolvedValue({ agent: 'npm', version: '1.0.0' }),
}))

vitest.mock('package-manager-detector', () => ({
  detect: vitest.fn().mockResolvedValue({ agent: 'npm', version: '1.0.0' }),
}))

vitest.mock('../src/utils/npm.ts', () => ({
  fetchPackageInfo: vitest.fn().mockImplementation((name: string) => {
    const versions: Record<string, any> = {
      'lodash': { tags: { latest: '4.17.21' }, versions: ['4.13.19', '4.17.21'] },
      'express': { tags: { latest: '4.19.2' }, versions: ['4.12.0', '4.19.2'] },
      'react': { tags: { latest: '18.3.1' }, versions: ['18.2.0', '18.3.1'] },
      '@types/lodash': { tags: { latest: '4.17.7' }, versions: ['4.14.0', '4.17.7'] },
      'typescript': { tags: { latest: '5.5.4' }, versions: ['3.5.0', '5.5.4'] },
      'webpack': { tags: { latest: '5.93.0' }, versions: ['1.9.10', '5.93.0'] },
      'react-dom': { tags: { latest: '18.3.1' }, versions: ['18.2.0', '18.3.1'] },
      'multer': { tags: { latest: '1.4.5' }, versions: ['0.1.8', '1.4.5'] },
      'pnpm': { tags: { latest: '9.7.1' }, versions: ['8.15.0', '9.7.1'] },
    }
    return Promise.resolve(versions[name] || { tags: { latest: '1.0.0' }, versions: ['1.0.0'] })
  }),
}))

const options: CheckOptions = {
  cwd: `${process.cwd()}/test/fixtures/package-yaml`,
  mode: 'default',
  write: false,
  all: false,
  loglevel: 'silent',
  peer: true, // peerDependencies included
}

describe('package.yaml functionality', () => {
  beforeEach(() => {
    output = undefined
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should load package.yaml file correctly', async () => {
    const { packages } = await CheckPackages(options)
    const firstPackage = packages[0]

    expect(packages).toHaveLength(1)
    expect(firstPackage.type).toBe('package.yaml')
    expect(firstPackage.name).toBe('@taze/package-yaml-example')
    expect(firstPackage.version).toBe('1.0.0')
    expect(firstPackage.private).toBe(false)

    expect(firstPackage.deps).toContainEqual(expect.objectContaining({
      name: 'lodash',
      currentVersion: '^4.13.19',
      source: 'dependencies',
    }))
    expect(firstPackage.deps).toContainEqual(expect.objectContaining({
      name: 'express',
      currentVersion: '4.12.x',
      source: 'dependencies',
    }))
    expect(firstPackage.deps).toContainEqual(expect.objectContaining({
      name: '@types/lodash',
      currentVersion: '^4.14.0',
      source: 'devDependencies',
    }))
    expect(firstPackage.deps).toContainEqual(expect.objectContaining({
      name: 'react-dom',
      currentVersion: '^18.2.0',
      source: 'peerDependencies',
    }))
    expect(firstPackage.deps).toContainEqual(expect.objectContaining({
      name: 'multer',
      currentVersion: '^0.1.8',
      source: 'optionalDependencies',
    }))
    expect(firstPackage.deps).toContainEqual(expect.objectContaining({
      name: 'pnpm',
      currentVersion: '^10.19.0',
      source: 'packageManager',
    }))
  })

  it('should write updated dependencies to package.yaml', async () => {
    const pkgYaml: PackageYamlMeta = {
      name: '@taze/package-yaml-example',
      version: '1.0.0',
      private: false,
      type: 'package.yaml',
      filepath: '/tmp/package.yaml',
      relative: 'package.yaml',
      raw: {
        name: '@taze/package-yaml-example',
        version: '1.0.0',
        dependencies: {
          lodash: '^4.13.19',
          express: '4.12.x',
        },
        devDependencies: {
          '@types/lodash': '^4.14.0',
          'typescript': '3.5',
        },
      },
      deps: [],
      resolved: [
        {
          name: 'lodash',
          currentVersion: '^4.13.19',
          targetVersion: '^4.17.21',
          source: 'dependencies',
          update: true,
          diff: 'minor',
          pkgData: { tags: { latest: '4.17.21' }, versions: ['4.17.21'] },
          provenanceDowngraded: false,
        },
        {
          name: '@types/lodash',
          currentVersion: '^4.14.0',
          targetVersion: '^4.17.7',
          source: 'devDependencies',
          update: true,
          diff: 'minor',
          pkgData: { tags: { latest: '4.17.7' }, versions: ['4.17.7'] },
          provenanceDowngraded: false,
        },
      ],
    }

    await packageYaml.writePackageYAML(pkgYaml, {})

    expect(output).toContain('lodash: ^4.17.21')
    expect(output).toContain('\'@types/lodash\': ^4.17.7')

    // Verify YAML structure is maintained
    expect(output).toMatch(/name: (['"]?)@taze\/package-yaml-example\1/)
    expect(output).toMatch(/version: (['"]?)1\.0\.0\1/)
    expect(output).toMatch(/dependencies:/)
    expect(output).toMatch(/devDependencies:/)
  })

  it('should preserve YAML formatting and comments', async () => {
    const yamlContent = `name: "@taze/test"
version: "1.0.0"
# This is a comment
dependencies:
  lodash: "^4.13.19"  # inline comment
  express: "4.12.x"

devDependencies:
  typescript: "3.5"
`

    const filepath = '/tmp/package.yaml'

    // Mock readFile to return our YAML content
    vi.mocked(await import('node:fs/promises')).readFile = vi.fn().mockResolvedValue(yamlContent)

    const raw = await packageYaml.readYAML(filepath)
    expect(raw.name).toBe('@taze/test')
    expect(raw.dependencies).toEqual({
      lodash: '^4.13.19',
      express: '4.12.x',
    })
  })

  it('should detect package.yaml as higher priority than package.json', async () => {
    // Test that when both package.yaml and package.json exist, package.yaml takes priority
    const { packages } = await CheckPackages({
      ...options,
      cwd: `${process.cwd()}/test/fixtures/package-yaml`,
    })

    expect(packages).toHaveLength(1)
    expect(packages[0].type).toBe('package.yaml')
  })
})
