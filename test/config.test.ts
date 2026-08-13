import type { CheckOptions, CommonOptions } from '../src'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveConfig } from '../src/config'

const tmpRoots: string[] = []

function makeTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taze-config-'))
  tmpRoots.push(dir)
  return dir
}

function write(dir: string, relpath: string, content: string) {
  const full = path.join(dir, relpath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf-8')
}

afterAll(() => {
  for (const dir of tmpRoots)
    fs.rmSync(dir, { recursive: true, force: true })
})

describe('resolveConfig folds pnpm update ignores into exclude', () => {
  let cwd: string

  beforeEach(() => {
    cwd = makeTmp()
  })

  it('adds pnpm ignores to exclude', async () => {
    write(cwd, 'pnpm-workspace.yaml', 'update:\n  ignoreDeps:\n    - react\n    - "@babel/*"\n')
    const options: CommonOptions = { cwd, loglevel: 'silent' }
    const { exclude } = await resolveConfig(options)
    expect(exclude).toEqual(['react', '@babel/*'])
  })

  it('unions with a user-provided exclude (additive, deduped)', async () => {
    write(cwd, 'pnpm-workspace.yaml', 'update:\n  ignoreDeps:\n    - react\n    - vue\n')
    const options: CommonOptions = { cwd, loglevel: 'silent', exclude: ['vue', 'lodash'] }
    const { exclude } = await resolveConfig(options)
    expect(exclude).toEqual(['vue', 'lodash', 'react'])
  })

  it('does not apply in global mode', async () => {
    write(cwd, 'pnpm-workspace.yaml', 'update:\n  ignoreDeps:\n    - react\n')
    const options: CheckOptions = { cwd, loglevel: 'silent', global: true }
    const { exclude } = await resolveConfig(options)
    expect(exclude).toEqual([])
  })

  it('leaves exclude untouched when there are no pnpm ignores', async () => {
    write(cwd, 'pnpm-workspace.yaml', 'packages:\n  - "packages/*"\n')
    const options: CommonOptions = { cwd, loglevel: 'silent' }
    const { exclude } = await resolveConfig(options)
    expect(exclude).toEqual([])
  })
})

describe('resolveConfig infers maturity settings', () => {
  let cwd: string

  beforeEach(() => {
    cwd = makeTmp()
  })

  it('infers maturityPeriod from pnpm-workspace.yaml when unset', async () => {
    write(cwd, 'pnpm-workspace.yaml', 'minimumReleaseAge: 1440\n')
    const options: CommonOptions = { cwd, loglevel: 'silent' }
    const { maturityPeriod } = (await resolveConfig(options)) as CheckOptions
    expect(maturityPeriod).toBe(1)
  })

  it('does not override an explicit maturityPeriod', async () => {
    write(cwd, 'pnpm-workspace.yaml', 'minimumReleaseAge: 1440\n')
    const options: CheckOptions = { cwd, loglevel: 'silent', maturityPeriod: 7 }
    const { maturityPeriod } = (await resolveConfig(options)) as CheckOptions
    expect(maturityPeriod).toBe(7)
  })
})

describe('resolveConfig honors DO_NOT_TRACK for the fast-npm-meta endpoint', () => {
  let cwd: string

  beforeEach(() => {
    cwd = makeTmp()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('clears fastNpmMetaApiEndpoint when DO_NOT_TRACK is set', async () => {
    vi.stubEnv('DO_NOT_TRACK', '1')
    const options: CommonOptions = { cwd, fastNpmMetaApiEndpoint: 'https://example.com/meta' }
    const { fastNpmMetaApiEndpoint } = await resolveConfig(options)
    expect(fastNpmMetaApiEndpoint).toBeUndefined()
  })

  it('preserves fastNpmMetaApiEndpoint when DO_NOT_TRACK is unset', async () => {
    vi.stubEnv('DO_NOT_TRACK', '')
    const options: CommonOptions = { cwd, fastNpmMetaApiEndpoint: 'https://example.com/meta' }
    const { fastNpmMetaApiEndpoint } = await resolveConfig(options)
    expect(fastNpmMetaApiEndpoint).toBe('https://example.com/meta')
  })

  it('preserves fastNpmMetaApiEndpoint when DO_NOT_TRACK is absent', async () => {
    delete process.env.DO_NOT_TRACK
    const options: CommonOptions = { cwd, fastNpmMetaApiEndpoint: 'https://example.com/meta' }
    const { fastNpmMetaApiEndpoint } = await resolveConfig(options)
    expect(fastNpmMetaApiEndpoint).toBe('https://example.com/meta')
  })

  it('does not mutate the input options object', async () => {
    vi.stubEnv('DO_NOT_TRACK', '1')
    const options: CommonOptions = { cwd, fastNpmMetaApiEndpoint: 'https://example.com/meta' }
    await resolveConfig(options)
    expect(options.fastNpmMetaApiEndpoint).toBe('https://example.com/meta')
  })
})
