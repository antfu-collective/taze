import type { CheckOptions, ResolvedDepChange } from '../src'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { CheckPackages } from '../src'
import { getHexHashFromIntegrity } from '../src/utils/sha'

function getPkgInfo(name: string, result: ResolvedDepChange[]) {
  return result.filter(r => r.name === name)[0]
}

const pnpmVersion = '10.23.0'
const pnpmIntegrity = 'sha512-IcTlaYACrel+Tv6Li0qJqN48haN5GflX56DzDzj7xbvdBZgP/ikXmy+25uaRJC4JjZRdFgF3LK0P71+2QR4qSw=='
const pnpmHexHash = '21c4e5698002ade97e4efe8b8b4a89a8de3c85a37919f957e7a0f30f38fbc5bbdd05980ffe29179b2fb6e6e691242e098d945d1601772cad0fef5fb6411e2a4b'

describe('get hex hash from integrity', () => {
  it('should return correct hex hash', () => {
    expect(getHexHashFromIntegrity(pnpmIntegrity)).toBe(pnpmHexHash)
  })
})

describe('check package for packageManager', async () => {
  const options: CheckOptions = {
    cwd: `${process.cwd()}/test/fixtures/package-manager`,
    mode: 'default',
  }
  const result = (await CheckPackages(options, {})).packages[0].resolved
  const pnpmInfo = getPkgInfo('pnpm', result)

  it('update pnpm packageManager', () => {
    expect(pnpmInfo.update).toBe(true)
    expect(pnpmInfo.hexHash).toBeUndefined()
    expect(pnpmInfo.currentVersion).toBe(`^${pnpmVersion}`)
    const version = pnpmInfo.currentVersion.slice(1)
    expect(pnpmInfo.pkgData.integrity?.[version]).toBe(pnpmIntegrity)
  })
})

describe('check package for packageManager with sha', async () => {
  const options: CheckOptions = {
    cwd: `${process.cwd()}/test/fixtures/package-manager-sha`,
    mode: 'default',
  }
  const result = (await CheckPackages(options, {})).packages[0].resolved
  const pnpmInfo = getPkgInfo('pnpm', result)
  it('update pnpm packageManager', () => {
    expect(pnpmInfo.update).toBe(true)
    expect(pnpmInfo.hexHash).toBe(pnpmHexHash)
  })
})
