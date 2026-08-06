import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { spawnSyncMock } = vi.hoisted(() => ({ spawnSyncMock: vi.fn() }))

vi.mock('node:child_process', () => ({ spawnSync: spawnSyncMock }))

const ENV_KEYS = ['GITHUB_TOKEN', 'GH_TOKEN'] as const
let savedEnv: Record<string, string | undefined>

beforeEach(() => {
  vi.resetModules()
  spawnSyncMock.mockReset()
  savedEnv = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]))
  for (const k of ENV_KEYS)
    delete process.env[k]
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined)
      delete process.env[k]
    else
      process.env[k] = savedEnv[k]
  }
})

async function getGitHubToken() {
  const mod = await import('../src/utils/github')
  return mod.getGitHubToken()
}

describe('getGitHubToken', () => {
  it('prefers GITHUB_TOKEN and never spawns gh', async () => {
    process.env.GITHUB_TOKEN = 'env-token'
    expect(await getGitHubToken()).toBe('env-token')
    expect(spawnSyncMock).not.toHaveBeenCalled()
  })

  it('falls back to GH_TOKEN', async () => {
    process.env.GH_TOKEN = 'gh-env-token'
    expect(await getGitHubToken()).toBe('gh-env-token')
    expect(spawnSyncMock).not.toHaveBeenCalled()
  })

  it('resolves a token from the gh CLI when no env var is set', async () => {
    spawnSyncMock.mockReturnValue({ status: 0, stdout: 'gh-cli-token\n' })
    expect(await getGitHubToken()).toBe('gh-cli-token')
    expect(spawnSyncMock).toHaveBeenCalledWith('gh', ['auth', 'token'], expect.any(Object))
  })

  it('caches the gh CLI lookup (spawns at most once)', async () => {
    spawnSyncMock.mockReturnValue({ status: 0, stdout: 'gh-cli-token\n' })
    const mod = await import('../src/utils/github')
    expect(mod.getGitHubToken()).toBe('gh-cli-token')
    expect(mod.getGitHubToken()).toBe('gh-cli-token')
    expect(spawnSyncMock).toHaveBeenCalledTimes(1)
  })

  it('returns undefined when gh is unavailable or not logged in', async () => {
    spawnSyncMock.mockReturnValue({ status: 1, stdout: '' })
    expect(await getGitHubToken()).toBeUndefined()
  })
})
