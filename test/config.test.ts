import type { CheckOptions, CommonOptions } from '../src'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { cac } from 'cac'
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

/**
 * Mirror taze's CLI flags that declare a cac `default` (or a `--no-*` negation
 * default). Parsing with `{ run: false }` is how the CLI builds the object
 * later merged on top of the config file.
 */
function parseCliDefaults(argv: string[]) {
  const cli = cac('taze')
  cli
    .option('--ignore-other-workspaces', '', { default: true })
    .option('--no-github-actions', '')
    .option('--github-actions-style <style>', '')
    .option('--no-node-version', '')
    .option('--concurrency <requests>', '', { default: 10 })
    .option('--request-timeout <ms>', '', { default: 5000 })
  const { options } = cli.parse(['node', 'taze', ...argv], { run: false })
  const { '--': _unused, ...rest } = options
  return rest as CheckOptions
}

describe('resolveConfig does not let untyped CLI defaults clobber the config file', () => {
  let cwd: string

  beforeEach(() => {
    cwd = makeTmp()
  })

  it('injects exactly the five defaulted keys when argv is empty', () => {
    expect(parseCliDefaults([])).toEqual({
      ignoreOtherWorkspaces: true,
      githubActions: true,
      nodeVersion: true,
      concurrency: 10,
      requestTimeout: 5000,
    })
  })

  it('keeps config-file values when argv does not mention the flags', async () => {
    write(cwd, '.tazerc.json', JSON.stringify({
      requestTimeout: 1,
      concurrency: 3,
      ignoreOtherWorkspaces: false,
      githubActions: false,
      nodeVersion: false,
    }))

    const resolved = await resolveConfig({ ...parseCliDefaults([]), cwd }, []) as CheckOptions

    expect(resolved.requestTimeout).toBe(1)
    expect(resolved.concurrency).toBe(3)
    expect(resolved.ignoreOtherWorkspaces).toBe(false)
    expect(resolved.githubActions).toBe(false)
    expect(resolved.nodeVersion).toBe(false)
  })

  it('preserves a githubActions object from the config file', async () => {
    write(cwd, '.tazerc.json', JSON.stringify({
      githubActions: { style: 'auto' },
    }))

    const resolved = await resolveConfig({ ...parseCliDefaults([]), cwd }, []) as CheckOptions

    expect(resolved.githubActions).toEqual({ style: 'auto' })
  })

  it('lets --request-timeout override the config file', async () => {
    write(cwd, '.tazerc.json', JSON.stringify({ requestTimeout: 1 }))
    const argv = ['--request-timeout', '9']
    const resolved = await resolveConfig({ ...parseCliDefaults(argv), cwd }, argv) as CheckOptions
    expect(resolved.requestTimeout).toBe(9)
  })

  it('lets --concurrency= override the config file', async () => {
    write(cwd, '.tazerc.json', JSON.stringify({ concurrency: 3 }))
    const argv = ['--concurrency=7']
    const resolved = await resolveConfig({ ...parseCliDefaults(argv), cwd }, argv) as CheckOptions
    expect(resolved.concurrency).toBe(7)
  })

  it('lets --no-github-actions override a config-file true', async () => {
    write(cwd, '.tazerc.json', JSON.stringify({ githubActions: true }))
    const argv = ['--no-github-actions']
    const resolved = await resolveConfig({ ...parseCliDefaults(argv), cwd }, argv) as CheckOptions
    expect(resolved.githubActions).toBe(false)
  })

  it('lets --no-node-version override a config-file true', async () => {
    write(cwd, '.tazerc.json', JSON.stringify({ nodeVersion: true }))
    const argv = ['--no-node-version']
    const resolved = await resolveConfig({ ...parseCliDefaults(argv), cwd }, argv) as CheckOptions
    expect(resolved.nodeVersion).toBe(false)
  })

  it('lets --no-ignore-other-workspaces override a config-file true', async () => {
    write(cwd, '.tazerc.json', JSON.stringify({ ignoreOtherWorkspaces: true }))
    const argv = ['--no-ignore-other-workspaces']
    const resolved = await resolveConfig({ ...parseCliDefaults(argv), cwd }, argv) as CheckOptions
    expect(resolved.ignoreOtherWorkspaces).toBe(false)
  })

  it('lets an explicit --github-actions override config-file false', async () => {
    write(cwd, '.tazerc.json', JSON.stringify({ githubActions: false }))
    const argv = ['--github-actions']
    const resolved = await resolveConfig({ ...parseCliDefaults(argv), cwd }, argv) as CheckOptions
    expect(resolved.githubActions).toBe(true)
  })

  it('does not treat --node-version as a --no-* flag', async () => {
    write(cwd, '.tazerc.json', JSON.stringify({ nodeVersion: false }))
    const argv = ['--node-version']
    const resolved = await resolveConfig({ ...parseCliDefaults(argv), cwd }, argv) as CheckOptions
    expect(resolved.nodeVersion).toBe(true)
  })

  it('applies --github-actions-style when --github-actions is omitted', async () => {
    write(cwd, '.tazerc.json', JSON.stringify({ githubActions: { style: 'auto' } }))
    const argv = ['--github-actions-style', 'sha']
    const resolved = await resolveConfig({ ...parseCliDefaults(argv), cwd }, argv) as CheckOptions
    expect(resolved.githubActions).toEqual({ style: 'sha' })
  })

  it('still lets programmatic options override the config file without argv', async () => {
    write(cwd, '.tazerc.json', JSON.stringify({ requestTimeout: 1, githubActions: false }))
    const resolved = await resolveConfig({ cwd, requestTimeout: 9, githubActions: true }) as CheckOptions
    expect(resolved.requestTimeout).toBe(9)
    expect(resolved.githubActions).toBe(true)
  })

  it('keeps documented defaults when neither config nor flags set them', async () => {
    const resolved = await resolveConfig({ ...parseCliDefaults([]), cwd }, []) as CheckOptions
    expect(resolved.requestTimeout).toBe(5000)
    expect(resolved.concurrency).toBe(10)
    expect(resolved.ignoreOtherWorkspaces).toBe(true)
    expect(resolved.githubActions).toBe(true)
    expect(resolved.nodeVersion).toBe(true)
  })

  it('lets --no-github-actions disable a config-file style object', async () => {
    write(cwd, '.tazerc.json', JSON.stringify({ githubActions: { style: 'auto' } }))
    const argv = ['--no-github-actions']
    const resolved = await resolveConfig({ ...parseCliDefaults(argv), cwd }, argv) as CheckOptions
    expect(resolved.githubActions).toBe(false)
  })

  it('does not mutate the parsed CLI options object', async () => {
    write(cwd, '.tazerc.json', JSON.stringify({ requestTimeout: 1 }))
    const parsed = { ...parseCliDefaults([]), cwd }
    await resolveConfig(parsed, [])
    expect(parsed.requestTimeout).toBe(5000)
  })
})
