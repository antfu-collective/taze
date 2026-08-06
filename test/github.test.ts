import { describe, expect, it } from 'vitest'
import { formatUses, parseUses, parseVersionTag, selectTarget } from '../src/utils/github'

describe('parseVersionTag', () => {
  it('parses v-prefixed tags with granularity', () => {
    expect(parseVersionTag('v4')).toMatchObject({ major: 4, minor: 0, patch: 0, segments: 1, prerelease: false })
    expect(parseVersionTag('v4.1')).toMatchObject({ major: 4, minor: 1, patch: 0, segments: 2 })
    expect(parseVersionTag('v4.1.1')).toMatchObject({ major: 4, minor: 1, patch: 1, segments: 3 })
    expect(parseVersionTag('v5.0.0-beta.1')).toMatchObject({ major: 5, prerelease: true })
  })

  it('rejects non v-prefixed refs', () => {
    expect(parseVersionTag('main')).toBeNull()
    expect(parseVersionTag('4.1.1')).toBeNull()
    expect(parseVersionTag('release/v1')).toBeNull()
    expect(parseVersionTag('latest')).toBeNull()
  })
})

describe('parseUses', () => {
  it('parses a plain tag ref', () => {
    expect(parseUses('actions/checkout@v4')).toEqual({
      repo: 'actions/checkout',
      subpath: '',
      tag: 'v4',
      style: 'tag',
    })
  })

  it('parses a subpath / reusable workflow ref', () => {
    expect(parseUses('org/repo/.github/workflows/ci.yml@v1.2.3')).toEqual({
      repo: 'org/repo',
      subpath: '/.github/workflows/ci.yml',
      tag: 'v1.2.3',
      style: 'tag',
    })
  })

  it('parses a SHA pin using the trailing comment as the version', () => {
    expect(parseUses('actions/cache@1111111111111111111111111111111111111111', ' v3.3.1')).toEqual({
      repo: 'actions/cache',
      subpath: '',
      tag: 'v3.3.1',
      style: 'sha',
      sha: '1111111111111111111111111111111111111111',
    })
  })

  it('skips a SHA pin without a version comment', () => {
    expect(parseUses('actions/cache@1111111111111111111111111111111111111111')).toBeNull()
  })

  it('skips branch refs, non-v tags, local and docker actions', () => {
    expect(parseUses('actions/checkout@main')).toBeNull()
    expect(parseUses('actions/checkout@1.2.3')).toBeNull()
    expect(parseUses('./.github/actions/local')).toBeNull()
    expect(parseUses('docker://alpine:3.18')).toBeNull()
  })
})

describe('selectTarget', () => {
  const tags = ['v3', 'v3.5.0', 'v3.6.0', 'v4', 'v4.0.0', 'v4.1.0', 'v4.1.1']

  it('preserves major-only granularity (v3 -> v4)', () => {
    expect(selectTarget('v3', tags, 'major')).toEqual({ tag: 'v4', resolvedTag: 'v4.1.1' })
  })

  it('does not "update" a moving major tag within the same major', () => {
    // in default/minor mode, `@v3` already floats within v3 -> no change
    expect(selectTarget('v3', tags, 'default')).toEqual({ tag: 'v3', resolvedTag: 'v3.6.0' })
  })

  it('preserves full granularity (v3.5.0 -> v4.1.1)', () => {
    expect(selectTarget('v3.5.0', tags, 'major')).toEqual({ tag: 'v4.1.1', resolvedTag: 'v4.1.1' })
  })

  it('honors minor mode (stay within the current major)', () => {
    expect(selectTarget('v4.0.0', tags, 'minor')).toEqual({ tag: 'v4.1.1', resolvedTag: 'v4.1.1' })
  })

  it('honors patch mode (stay within the current minor)', () => {
    expect(selectTarget('v3.5.0', ['v3.5.0', 'v3.5.1', 'v3.6.0', 'v4.0.0'], 'patch'))
      .toEqual({ tag: 'v3.5.1', resolvedTag: 'v3.5.1' })
  })

  it('falls back to the concrete tag when no moving tag exists', () => {
    expect(selectTarget('v4', ['v4', 'v5.1.0', 'v5.2.0'], 'major'))
      .toEqual({ tag: 'v5.2.0', resolvedTag: 'v5.2.0' })
  })

  it('skips prereleases unless in newest mode', () => {
    const t = ['v4.0.0', 'v4.1.0', 'v5.0.0-beta.1']
    expect(selectTarget('v4.0.0', t, 'major')).toEqual({ tag: 'v4.1.0', resolvedTag: 'v4.1.0' })
    expect(selectTarget('v4.0.0', t, 'newest')).toEqual({ tag: 'v5.0.0-beta.1', resolvedTag: 'v5.0.0-beta.1' })
  })

  it('returns undefined when already up to date', () => {
    expect(selectTarget('v4.1.1', tags, 'major')).toBeUndefined()
  })

  it('respects the reject predicate', () => {
    expect(selectTarget('v3', tags, 'major', { reject: t => t.major === 4 }))
      .toEqual({ tag: 'v3', resolvedTag: 'v3.6.0' })
  })
})

describe('formatUses', () => {
  it('rebuilds a uses reference', () => {
    expect(formatUses('actions/checkout', '', 'v4')).toBe('actions/checkout@v4')
    expect(formatUses('org/repo', '/.github/workflows/ci.yml', 'v2')).toBe('org/repo/.github/workflows/ci.yml@v2')
  })
})
