import type { CheckOptions } from '../src'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadGlobalBunPackage } from '../src/commands/check/checkGlobal'

/** Lays out a bun global dir (`$BUN_INSTALL/install/global`) and points `BUN_INSTALL` at it. */
function makeBunGlobal(
  manifest: Record<string, unknown>,
  installed: Record<string, string | { name: string, version: string }> = {},
): string {
  const root = fs.mkdtempSync(join(os.tmpdir(), 'taze-bun-global-'))
  const dir = join(root, 'install', 'global')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest), 'utf-8')
  for (const [name, meta] of Object.entries(installed)) {
    const pkg = typeof meta === 'string' ? { name, version: meta } : meta
    fs.mkdirSync(join(dir, 'node_modules', name), { recursive: true })
    fs.writeFileSync(join(dir, 'node_modules', name, 'package.json'), JSON.stringify(pkg), 'utf-8')
  }
  vi.stubEnv('BUN_INSTALL', root)
  vi.stubEnv('BUN_INSTALL_GLOBAL_DIR', '')
  return dir
}

afterEach(() => {
  vi.unstubAllEnvs()
})

const options: CheckOptions = { loglevel: 'silent' }

describe('loadGlobalBunPackage', () => {
  it('prefers the installed version over the manifest range', async () => {
    makeBunGlobal({ dependencies: { 'is-number': '1.0.0', 'chalk': '^4.0.0' } }, { 'is-number': '1.1.2' })

    const [pkg] = await loadGlobalBunPackage(options)

    expect(pkg.agent).toBe('bun')
    expect(pkg.deps.map(d => [d.name, d.currentVersion])).toEqual([
      ['is-number', '^1.1.2'],
      ['chalk', '^4.0.0'],
    ])
  })

  it('leaves URL specs untouched even when installed', async () => {
    const url = 'https://pkg.pr.new/owner/repo/my-cli@main'
    makeBunGlobal({ dependencies: { 'my-cli': url } }, { 'my-cli': '0.1.0' })

    const [pkg] = await loadGlobalBunPackage(options)

    expect(pkg.deps.map(d => [d.name, d.currentVersion])).toEqual([['my-cli', url]])
  })

  it('leaves protocol-less non-registry specs untouched', async () => {
    makeBunGlobal(
      { dependencies: { 'is-number': 'jonschlinkert/is-number', 'local-cli': '/tmp/local-cli' } },
      { 'is-number': '7.0.0', 'local-cli': '0.0.7' },
    )

    const [pkg] = await loadGlobalBunPackage(options)

    expect(pkg.deps.map(d => [d.name, d.currentVersion])).toEqual([
      ['is-number', 'jonschlinkert/is-number'],
      ['local-cli', '/tmp/local-cli'],
    ])
  })

  it('reads every section, letting optionalDependencies override dependencies', async () => {
    makeBunGlobal(
      {
        dependencies: { 'is-number': '1.0.0', 'chalk': '4.0.0' },
        devDependencies: { picocolors: '1.0.0' },
        peerDependencies: { 'strip-ansi': '6.0.0' },
        optionalDependencies: { chalk: '4.1.0' },
      },
      { 'is-number': '1.0.0', 'chalk': '4.1.2', 'picocolors': '1.1.1', 'strip-ansi': '6.0.1' },
    )

    const [pkg] = await loadGlobalBunPackage(options)

    expect(pkg.deps.map(d => [d.name, d.currentVersion])).toEqual([
      ['picocolors', '^1.1.1'],
      ['strip-ansi', '^6.0.1'],
      ['is-number', '^1.0.0'],
      ['chalk', '^4.1.2'],
    ])
  })

  it('keeps npm aliases pointing at the installed package', async () => {
    makeBunGlobal(
      { dependencies: { mynum: 'npm:is-number@1.0.0', real: 'npm:real-cli', stale: 'npm:wrong-name@1.0.0' } },
      {
        mynum: { name: 'is-number', version: '1.1.2' },
        real: { name: 'real-cli', version: '2.0.0' },
        stale: { name: 'actual-cli', version: '3.0.0' },
      },
    )

    const [pkg] = await loadGlobalBunPackage(options)

    expect(pkg.deps.map(d => [d.name, d.currentVersion])).toEqual([
      ['mynum', 'npm:is-number@^1.1.2'],
      ['real', 'npm:real-cli@^2.0.0'],
      ['stale', 'npm:actual-cli@^3.0.0'],
    ])
  })

  it('honors BUN_INSTALL_GLOBAL_DIR', async () => {
    const dir = makeBunGlobal({ dependencies: { 'is-number': '1.0.0' } }, { 'is-number': '1.1.2' })
    vi.stubEnv('BUN_INSTALL_GLOBAL_DIR', dir)

    const [pkg] = await loadGlobalBunPackage(options)

    expect(pkg.filepath).toBe(join(dir, 'package.json'))
    expect(pkg.deps.map(d => d.currentVersion)).toEqual(['^1.1.2'])
  })

  it('returns nothing when there is no global manifest', async () => {
    vi.stubEnv('BUN_INSTALL', fs.mkdtempSync(join(os.tmpdir(), 'taze-bun-global-empty-')))
    vi.stubEnv('BUN_INSTALL_GLOBAL_DIR', '')

    expect(await loadGlobalBunPackage(options)).toEqual([])
  })
})
