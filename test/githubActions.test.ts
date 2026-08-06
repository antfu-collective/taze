import type { CheckOptions } from '../src/types'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CheckPackages } from '../src'
import { fetchCommitDate } from '../src/utils/github'

// capture writes instead of touching the fixture on disk
let output: string | undefined
let writtenPath: string | undefined

vi.mock('node:fs/promises', async (importActual) => {
  const actual = await importActual<typeof import('node:fs/promises')>()
  return {
    ...actual,
    default: actual,
    writeFile(path: string, data: string) {
      writtenPath = path
      output = data
      return Promise.resolve()
    },
  }
})

const SHA: Record<string, Record<string, string>> = {
  'actions/checkout': {
    'v3': 'c0ffee00000000000000000000000000000000v3',
    'v3.5.0': 'c0ffee00000000000000000000000000000350v0',
    'v3.6.0': 'c0ffee00000000000000000000000000000360v0',
    'v4': 'c0ffee00000000000000000000000000000000v4',
    'v4.0.0': 'c0ffee00000000000000000000000000000400v0',
    'v4.1.0': 'c0ffee00000000000000000000000000000410v0',
    'v4.1.1': 'c0ffee00000000000000000000000000000411v0',
  },
  'actions/setup-node': {
    'v4': 'dead00000000000000000000000000000000000n4',
    'v4.0.0': 'dead0000000000000000000000000000000400n0',
    'v4.1.0': 'dead0000000000000000000000000000000410n0',
  },
  'actions/cache': {
    'v3': 'aaaa00000000000000000000000000000000000c3',
    'v3.3.1': 'aaaa0000000000000000000000000000000331c0',
    'v3.3.2': 'aaaa0000000000000000000000000000000332c0',
    'v4': 'aaaa00000000000000000000000000000000000c4',
    'v4.0.0': 'aaaa0000000000000000000000000000000400c0',
  },
  'org/repo': {
    'v1': '1111000000000000000000000000000000000v01',
    'v1.0.0': '1111000000000000000000000000000000100v0',
    'v2': '2222000000000000000000000000000000000v02',
    'v2.0.0': '2222000000000000000000000000000000200v0',
  },
}

vi.mock('../src/utils/github.ts', async (importActual) => {
  const actual = await importActual<typeof import('../src/utils/github')>()
  return {
    ...actual,
    fetchActionTags: vi.fn((repo: string) => Promise.resolve({
      versions: Object.keys(SHA[repo] ?? {}),
      shaMap: SHA[repo] ?? {},
    })),
    fetchCommitDate: vi.fn(() => Promise.resolve('2020-01-01T00:00:00Z')),
  }
})

const baseOptions: CheckOptions = {
  cwd: `${process.cwd()}/test/fixtures/github-actions`,
  loglevel: 'silent',
  write: false,
}

beforeEach(() => {
  output = undefined
  writtenPath = undefined
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('github actions loading & resolving', () => {
  it('discovers the workflow file and parses eligible uses refs', async () => {
    const { packages } = await CheckPackages({ ...baseOptions, mode: 'major' })
    const pkg = packages.find(p => p.type === 'github-action')!

    expect(pkg).toBeTruthy()
    expect(pkg.relative).toBe('.github/workflows/ci.yml')

    const names = pkg.deps.map(d => d.name).sort()
    // local (./), docker:// refs are skipped; reusable workflow call is included
    expect(names).toEqual(['actions/cache', 'actions/checkout', 'actions/setup-node', 'org/repo'])
  })

  it('resolves updates honoring granularity and mode (major)', async () => {
    const { packages } = await CheckPackages({ ...baseOptions, mode: 'major' })
    const pkg = packages.find(p => p.type === 'github-action')!
    const byName = Object.fromEntries(pkg.resolved.map(r => [r.name, r]))

    expect(byName['actions/checkout']).toMatchObject({ currentVersion: 'v3', targetVersion: 'v4', update: true, diff: 'major' })
    expect(byName['actions/setup-node']).toMatchObject({ currentVersion: 'v4.0.0', targetVersion: 'v4.1.0', update: true, diff: 'minor' })
    expect(byName['actions/cache']).toMatchObject({ currentVersion: 'v3.3.1', targetVersion: 'v4.0.0', update: true, diff: 'major' })
    expect(byName['org/repo']).toMatchObject({ currentVersion: 'v1', targetVersion: 'v2', update: true, diff: 'major' })
  })

  it('does not bump a floating major tag in default mode', async () => {
    const { packages } = await CheckPackages({ ...baseOptions, mode: 'default' })
    const pkg = packages.find(p => p.type === 'github-action')!
    const checkout = pkg.resolved.find(r => r.name === 'actions/checkout')!
    // `@v3` already floats within the v3 line
    expect(checkout.update).toBe(false)
  })

  it('honors --exclude by owner/repo', async () => {
    const { packages } = await CheckPackages({ ...baseOptions, mode: 'major', exclude: ['actions/checkout'] })
    const pkg = packages.find(p => p.type === 'github-action')!
    const checkout = pkg.resolved.find(r => r.name === 'actions/checkout')!
    expect(checkout.update).toBe(false)
  })

  it('can be disabled via githubActions: false', async () => {
    const { packages } = await CheckPackages({ ...baseOptions, mode: 'major', githubActions: false })
    expect(packages.find(p => p.type === 'github-action')).toBeUndefined()
  })

  it('applies the maturityPeriod cool-down using tag commit dates', async () => {
    // every candidate release is "brand new" -> all rejected by the cool-down
    vi.mocked(fetchCommitDate).mockResolvedValue(new Date().toISOString())

    const { packages } = await CheckPackages({ ...baseOptions, mode: 'major', maturityPeriod: 30 })
    const pkg = packages.find(p => p.type === 'github-action')!
    const checkout = pkg.resolved.find(r => r.name === 'actions/checkout')!

    expect(fetchCommitDate).toHaveBeenCalled()
    expect(checkout.update).toBe(false)
  })
})

describe('github actions writing', () => {
  it('preserves style in auto mode: tags stay tags, sha pins stay pinned', async () => {
    await CheckPackages({ ...baseOptions, mode: 'major', write: true })

    expect(writtenPath).toContain('.github/workflows/ci.yml')
    // tag-style refs updated in place
    expect(output).toContain('uses: actions/checkout@v4')
    expect(output).toContain('uses: actions/setup-node@v4.1.0')
    expect(output).toContain('uses: org/repo/.github/workflows/release.yml@v2')
    // sha-pinned ref stays sha-pinned with a refreshed version comment
    expect(output).toContain(`uses: actions/cache@${SHA['actions/cache']['v4.0.0']} # v4.0.0`)
    // untouched refs are preserved
    expect(output).toContain('uses: ./.github/actions/local')
    expect(output).toContain('uses: docker://alpine:3.18')
  })

  it('forces sha pinning when style: sha', async () => {
    await CheckPackages({ ...baseOptions, mode: 'major', write: true, githubActions: { style: 'sha' } })

    expect(output).toContain(`uses: actions/checkout@${SHA['actions/checkout'].v4} # v4`)
    expect(output).toContain(`uses: org/repo/.github/workflows/release.yml@${SHA['org/repo'].v2} # v2`)
  })

  it('forces tag style (dropping the sha) when style: tag', async () => {
    await CheckPackages({ ...baseOptions, mode: 'major', write: true, githubActions: { style: 'tag' } })

    // the previously sha-pinned cache action becomes a plain tag ref
    expect(output).toContain('uses: actions/cache@v4.0.0')
    expect(output).not.toContain(`actions/cache@${SHA['actions/cache']['v4.0.0']}`)
  })
})
