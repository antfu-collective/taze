import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fetch } from 'ofetch'
import { exec } from 'tinyexec'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addRegistry,
  currentRegistry,
  deleteRegistry,
  listRegistries,
  resetRegistryPaths,
  setRegistryPaths,
  testRegistries,
  useRegistry,
} from '../src/commands/registry'
import { REGISTRIES } from '../src/commands/registry/constants'
import { parseLegacyNrmrc, readRegistriesConfig } from '../src/commands/registry/io'

vi.mock('ofetch', () => ({
  fetch: vi.fn(),
}))

vi.mock('@posva/prompts', () => ({
  default: vi.fn(),
}))

vi.mock('tinyexec', () => ({
  exec: vi.fn(),
}))

const mockFetch = vi.mocked(fetch)
const mockExec = vi.mocked(exec)

let tmpDir: string
let registriesPath: string
let stdout: string[]

function captureConsole() {
  stdout = []
  vi.spyOn(console, 'log').mockImplementation((...args) => {
    stdout.push(args.join(' '))
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

function mockNpmConfigGet(registry: string) {
  mockExec.mockImplementation(((_cmd: string, args: readonly string[] | undefined) => {
    if (args?.[0] === 'config' && args[1] === 'get')
      return Promise.resolve({ stdout: `${registry}\n`, stderr: '', exitCode: 0 })
    return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 })
  }) as unknown as typeof exec)
}

describe('registry commands', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taze-registry-test-'))
    registriesPath = path.join(tmpDir, 'registries.yaml')
    setRegistryPaths({ registries: registriesPath })
    captureConsole()
    mockFetch.mockReset()
    mockExec.mockReset()
  })

  afterEach(() => {
    resetRegistryPaths()
    vi.restoreAllMocks()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('lists built-in registries', async () => {
    mockNpmConfigGet('https://registry.npmjs.org/')

    await listRegistries()

    const lines = stdout.join('\n').split('\n').filter(Boolean)
    expect(lines.some(line => line.includes('* npm'))).toBe(true)
    expect(lines.some(line => line.includes('taobao'))).toBe(true)
    expect(lines.length).toBe(Object.keys(REGISTRIES).length)
  })

  it('shows current registry by name', async () => {
    mockNpmConfigGet('https://registry.npmmirror.com/')

    await currentRegistry()

    expect(stdout.join('\n')).toContain('taobao')
  })

  it('switches registry with use', async () => {
    mockNpmConfigGet('https://registry.npmjs.org/')

    await useRegistry('taobao')

    expect(mockExec).toHaveBeenCalledWith(
      'npm',
      ['config', 'set', 'registry', 'https://registry.npmmirror.com/'],
      { throwOnError: true },
    )
    expect(stdout.join('\n')).toContain('SUCCESS')
  })

  it('adds and deletes a custom registry', async () => {
    mockNpmConfigGet('https://registry.example.com/')

    addRegistry('custom', 'https://registry.example.com', 'https://example.com')

    const config = readRegistriesConfig(registriesPath)
    expect(config.custom).toEqual({
      registry: 'https://registry.example.com/',
      home: 'https://example.com',
    })
    expect(fs.readFileSync(registriesPath, 'utf-8')).toContain('registry:')

    await deleteRegistry('custom')

    expect(readRegistriesConfig(registriesPath).custom).toBeUndefined()
    expect(stdout.some(line => line.includes('deleted successfully'))).toBe(true)
    expect(mockExec).toHaveBeenCalledWith(
      'npm',
      ['config', 'set', 'registry', 'https://registry.npmjs.org/'],
      { throwOnError: true },
    )
  })

  it('rejects duplicate registry names on add', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)

    addRegistry('npm', 'https://registry.example.com/')

    expect(exitSpy).toHaveBeenCalledWith(1)
    exitSpy.mockRestore()
  })

  it('handles test timeouts', async () => {
    mockNpmConfigGet('https://registry.npmjs.org/')
    mockFetch.mockRejectedValue(Object.assign(new Error('timeout'), { name: 'TimeoutError' }))

    const results = await testRegistries('npm', 100)

    expect(results).toHaveLength(1)
    expect(results[0].isTimeout).toBe(true)
    expect(results[0].success).toBe(false)
    expect(stdout.join('\n')).toContain('timeout')
  })

  it('parses legacy nrm ini format', () => {
    const content = [
      '[custom]',
      'registry=https://registry.example.com/',
      'home=https://example.com',
    ].join('\n')

    expect(parseLegacyNrmrc(content)).toEqual({
      custom: {
        registry: 'https://registry.example.com/',
        home: 'https://example.com',
      },
    })
  })

  it('reports successful registry tests', async () => {
    mockNpmConfigGet('https://registry.npmjs.org/')
    mockFetch.mockResolvedValue({ ok: true } as Response)

    const results = await testRegistries('npm', 5000)

    expect(results[0].success).toBe(true)
    expect(stdout.join('\n')).toContain('npm')
  })
})
