import type { CheckOptions, PackageMeta, ResolvedDepChange } from '../src'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { CheckPackages } from '../src'
import { writePackageJSON } from '../src/io/packageJson'
import { getHexHashFromIntegrity } from '../src/utils/sha'

function getPkgInfo(name: string, result: ResolvedDepChange[]) {
  return result.filter(r => r.name === name)[0]
}

const pnpmVersion = '10.23.0'
const pnpmIntegrity = 'sha512-IcTlaYACrel+Tv6Li0qJqN48haN5GflX56DzDzj7xbvdBZgP/ikXmy+25uaRJC4JjZRdFgF3LK0P71+2QR4qSw=='
const pnpmHexHash = '21c4e5698002ade97e4efe8b8b4a89a8de3c85a37919f957e7a0f30f38fbc5bbdd05980ffe29179b2fb6e6e691242e098d945d1601772cad0fef5fb6411e2a4b'

const originalPkgJson = {
  name: '@taze/package-manager',
  private: true,
  packageManager: `pnpm@${pnpmVersion}`,
}

const originalPkgJsonWithSha = {
  name: '@taze/package-manager-sha',
  private: true,
  packageManager: `pnpm@${pnpmVersion}+sha512.${pnpmHexHash}`,
}

describe('get hex hash from integrity', () => {
  it('should return correct hex hash', () => {
    expect(getHexHashFromIntegrity(pnpmIntegrity)).toBe(pnpmHexHash)
  })
})

describe('check package for packageManager', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taze-test-'))
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify(originalPkgJson, null, 2),
    )
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('update pnpm packageManager', async () => {
    const options: CheckOptions = {
      cwd: tempDir,
      mode: 'default',
      force: true,
    }
    const result = (await CheckPackages(options, {})).packages[0].resolved
    const pnpmInfo = getPkgInfo('pnpm', result)

    expect(pnpmInfo.update).toBe(true)
    expect(pnpmInfo.hexHash).toBeUndefined()
    expect(pnpmInfo.currentVersion).toBe(`^${pnpmVersion}`)
    const version = pnpmInfo.currentVersion.slice(1)
    expect(pnpmInfo.pkgData.integrity?.[version]).toBe(pnpmIntegrity)
  })

  it('write updated packageManager to package.json', async () => {
    const options: CheckOptions = {
      cwd: tempDir,
      mode: 'default',
      write: true,
      force: true,
    }
    await CheckPackages(options, {})
    const updatedResult = (await CheckPackages(options, {})).packages[0].resolved
    const updatedPnpmInfo = getPkgInfo('pnpm', updatedResult)
    expect(updatedPnpmInfo.update).toBe(false)
    expect(updatedPnpmInfo.currentVersion).not.toBe(`^${pnpmVersion}`)
    const pkgJson = JSON.parse(fs.readFileSync(path.join(tempDir, 'package.json'), 'utf-8'))
    expect(pkgJson.packageManager).toBe(`pnpm@${updatedPnpmInfo.currentVersion.slice(1)}`)
  })
})

describe('check package for packageManager with sha', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taze-test-sha-'))
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify(originalPkgJsonWithSha, null, 2),
    )
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('update pnpm packageManager', async () => {
    const options: CheckOptions = {
      cwd: tempDir,
      mode: 'default',
      force: true,
    }
    const result = (await CheckPackages(options, {})).packages[0].resolved
    const pnpmInfo = getPkgInfo('pnpm', result)
    expect(pnpmInfo.update).toBe(true)
    expect(pnpmInfo.hexHash).toBe(pnpmHexHash)

    options.write = true
    await CheckPackages(options, {})
    const updatedResult = (await CheckPackages(options, {})).packages[0].resolved
    const updatedPnpmInfo = getPkgInfo('pnpm', updatedResult)
    expect(updatedPnpmInfo.update).toBe(false)
    expect(updatedPnpmInfo.currentVersion).not.toBe(`^${pnpmVersion}`)
    const pkgJson = JSON.parse(fs.readFileSync(path.join(tempDir, 'package.json'), 'utf-8'))
    const expectedHexHash = updatedPnpmInfo.hexHash
    expect(pkgJson.packageManager).toBe(`pnpm@${updatedPnpmInfo.currentVersion.slice(1)}+sha512.${expectedHexHash}`)
  })
})

// Regression test for https://github.com/antfu-collective/taze/issues/260
//
// When `--include` filters out the package manager, taze never fetches its registry
// data, so `pkgData` is undefined on the resolved dep. The `packageManager` write
// path used to read `resolvedDep.pkgData.integrity?.[version]` (optional chain on
// the wrong link), which threw `Cannot read properties of undefined (reading
// 'integrity')`. This test calls `writePackageJSON` directly with that exact shape
// to assert the write completes without throwing.
describe('writePackageJSON with packageManager+sha when pkgData is undefined', () => {
  let tempDir: string
  let filepath: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taze-test-pm-no-pkgdata-'))
    filepath = path.join(tempDir, 'package.json')
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('does not throw when the packageManager dep has hexHash but pkgData is undefined', async () => {
    const pnpmVersion = '10.29.2'
    const pnpmHexHash = 'bef43fa759d91fd2da4b319a5a0d13ef7a45bb985a3d7342058470f9d2051a3ba8674e629672654686ef9443ad13a82da2beb9eeb3e0221c87b8154fff9d74b8'
    const originalPackageManager = `pnpm@${pnpmVersion}+sha512.${pnpmHexHash}`

    const initialPkgJson = {
      name: 'taze-pm-no-pkgdata',
      private: true,
      packageManager: originalPackageManager,
      dependencies: {
        storybook: '10.4.0-alpha.8',
      },
    }
    fs.writeFileSync(filepath, JSON.stringify(initialPkgJson, null, 2))

    // pnpm came in via `packageManager` and was given a hexHash during loading,
    // but it was filtered out (--include storybook) so `update` is false and the
    // resolve path that populates `pkgData` was skipped. `pkgData` is undefined.
    const pnpmDep = {
      name: 'pnpm',
      currentVersion: `^${pnpmVersion}`,
      source: 'packageManager',
      update: false,
      hexHash: pnpmHexHash,
      targetVersion: `^${pnpmVersion}`,
      diff: null,
      provenanceDowngraded: false,
      pkgData: undefined,
    } as unknown as ResolvedDepChange

    // storybook was included and bumped, which is what triggers writePackageJSON
    // to run in the real flow.
    const storybookDep = {
      name: 'storybook',
      currentVersion: '10.4.0-alpha.8',
      source: 'dependencies',
      update: true,
      targetVersion: '10.4.0-alpha.10',
      diff: 'patch',
      provenanceDowngraded: false,
      pkgData: { tags: {}, versions: [] },
    } as unknown as ResolvedDepChange

    const pkg: PackageMeta = {
      name: initialPkgJson.name,
      private: true,
      version: '',
      type: 'package.json',
      relative: 'package.json',
      filepath,
      raw: { ...initialPkgJson },
      deps: [],
      resolved: [pnpmDep, storybookDep],
    }

    await expect(writePackageJSON(pkg, {})).resolves.not.toThrow()

    const updated = JSON.parse(fs.readFileSync(filepath, 'utf-8'))
    // The storybook bump is written.
    expect(updated.dependencies.storybook).toBe('10.4.0-alpha.10')
    // The packageManager line still names the same version of pnpm.
    expect(updated.packageManager).toMatch(/^pnpm@10\.29\.2/)
  })
})
