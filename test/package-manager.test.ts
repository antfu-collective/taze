import type { CheckOptions, ResolvedDepChange } from '../src'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { CheckPackages } from '../src'
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
