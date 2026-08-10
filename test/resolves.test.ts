import type { CheckOptions, DependencyFilter, PackageData, RawDep, ResolvedDepChange } from '../src'
import process from 'node:process'
import { expect, it, vi } from 'vitest'
import { resolveDependency } from '../src'
import { getDiff, getLatestVersionAvailable, getVersionOfRange, getVersionOfTag, updateTargetVersion } from '../src/io/resolves'

// `resolveDependency` fetches package metadata over the network. Mock it so
// the test suite is deterministic and doesn't depend on (or hammer) the real
// npm registry.
const { fetchPackageMock } = vi.hoisted(() => ({
  fetchPackageMock: vi.fn(),
}))

vi.mock('../src/utils/packument.ts', async importActual => ({
  ...await importActual<typeof import('../src/utils/packument')>(),
  fetchPackage: fetchPackageMock,
}))

// A synthetic, but semver-realistic, version ladder standing in for the real
// `typescript` package: exact patch/minor/major bumps above `4.0.0` so every
// range mode (`major`/`minor`/`patch`/`latest`/`newest`/`stable`) has a
// qualifying target version to resolve to.
const typescriptPackageData: PackageData = {
  tags: { latest: '6.0.0' },
  versions: ['3.9.0', '4.0.0', '4.0.1', '4.0.5', '4.1.0', '4.5.0', '4.9.5', '5.0.0', '5.5.0', '5.9.5', '6.0.0'],
}

// Mirrors the real `@test-zone/provenance` package on npm: `0.0.1` was
// published with trusted-publisher provenance, `0.0.2` (the latest) was not
// — a genuine provenance downgrade.
const provenancePackageData: PackageData = {
  tags: { latest: '0.0.2' },
  versions: ['0.0.1', '0.0.2'],
  provenance: { '0.0.1': 'trustedPublisher' },
}

fetchPackageMock.mockImplementation(async (spec: string) => {
  // Some callers pass a raw `name@version`/`name@range` spec straight through
  // (e.g. resolved from a yarn/pnpm override path); a real npm-arg parser
  // would strip the version part off, so match on the package name prefix.
  if (spec === 'typescript' || spec.startsWith('typescript@'))
    return typescriptPackageData
  if (spec === '@test-zone/provenance')
    return provenancePackageData
  if (spec === 'xyg-mdb')
    throw new Error('Not found')
  throw new Error(`No mock registered for package "${spec}"`)
})

const filter: DependencyFilter = () => true

function makePkg(ver: string): RawDep {
  const pkg: RawDep = {
    name: 'typescript',
    currentVersion: ver,
    source: 'dependencies',
    update: true,
  }
  return pkg
}

function makeLocalPkg(ver: string): RawDep {
  const pkg: RawDep = {
    name: 'xyg-mdb',
    currentVersion: ver,
    source: 'dependencies',
    update: true,
  }
  return pkg
}

function makePkgForResolutions(name: string, ver: string): RawDep {
  const pkg: RawDep = {
    name,
    currentVersion: ver,
    source: 'resolutions',
    update: true,
  }
  return pkg
}

function makePkgForPnpmOverrides(name: string, ver: string): RawDep {
  const pkg: RawDep = {
    name,
    currentVersion: ver,
    source: 'pnpm.overrides',
    update: true,
  }
  return pkg
}

const options: CheckOptions = {
  cwd: process.cwd(),
  loglevel: 'silent',
  mode: 'default',
  write: false,
  all: false,
}

function makeResolvedDepForMaturityPeriod(): ResolvedDepChange {
  const now = new Date()
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)

  return {
    name: 'test-package',
    currentVersion: '^1.0.0',
    source: 'dependencies',
    update: true,
    targetVersion: '^1.1.0',
    diff: 'minor',
    provenanceDowngraded: false,
    pkgData: {
      tags: {
        latest: '1.2.0',
        beta: '1.2.0',
        stable: '1.1.0',
      },
      versions: ['1.0.0', '1.1.0', '1.2.0'],
      time: {
        '1.0.0': twoDaysAgo.toISOString(),
        '1.1.0': twoDaysAgo.toISOString(),
        '1.2.0': now.toISOString(),
      },
    },
  }
}

function makeResolvedDepWithMaturePrereleaseFallback(): ResolvedDepChange {
  const now = new Date()
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)

  return {
    name: 'test-package',
    currentVersion: '^1.2.5',
    source: 'dependencies',
    update: true,
    targetVersion: '^1.2.5',
    diff: null,
    provenanceDowngraded: false,
    pkgData: {
      tags: {
        latest: '1.3.0',
        next: '1.3.0-rc.2',
      },
      versions: ['1.2.5', '1.3.0-rc.1', '1.3.0-rc.2', '1.3.0'],
      time: {
        '1.2.5': twoDaysAgo.toISOString(),
        '1.3.0-rc.1': twoDaysAgo.toISOString(),
        '1.3.0-rc.2': now.toISOString(),
        '1.3.0': now.toISOString(),
      },
    },
  }
}

function makeResolvedDepOnPrereleaseTrack(): ResolvedDepChange {
  const now = new Date()
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)

  return {
    name: 'test-package',
    currentVersion: '^2.0.0-rc.1',
    source: 'dependencies',
    update: true,
    targetVersion: '^2.0.0-rc.1',
    diff: null,
    provenanceDowngraded: false,
    pkgData: {
      tags: {
        latest: '2.0.0',
      },
      versions: ['2.0.0-rc.1', '2.0.0-rc.2', '2.0.0-rc.3', '2.0.0'],
      time: {
        '2.0.0-rc.1': twoDaysAgo.toISOString(),
        '2.0.0-rc.2': twoDaysAgo.toISOString(),
        '2.0.0-rc.3': twoDaysAgo.toISOString(),
        '2.0.0': now.toISOString(),
      },
    },
  }
}

function makeResolvedDepWithMajors(): ResolvedDepChange {
  return {
    name: 'typescript',
    currentVersion: '^6.0.0',
    source: 'dependencies',
    update: true,
    targetVersion: '^6.0.0',
    diff: null,
    provenanceDowngraded: false,
    pkgData: {
      tags: {
        latest: '7.1.0',
      },
      versions: ['6.0.0', '6.5.0', '7.0.0', '7.1.0'],
    },
  }
}

it('excludes a specific major version via `name@range` without excluding the whole package', () => {
  const excludeOptions = {
    ...options,
    exclude: ['typescript@7'],
  }

  // major/latest resolution skips the excluded 7.x line and falls back to the highest 6.x
  expect(getVersionOfRange(makeResolvedDepWithMajors(), 'major', excludeOptions)).toBe('6.5.0')
  expect(getVersionOfRange(makeResolvedDepWithMajors(), 'latest', excludeOptions)).toBe('6.5.0')
  expect(getVersionOfTag(makeResolvedDepWithMajors(), 'latest', excludeOptions)).toBe('6.5.0')

  // minor/patch within the still-allowed major keep working normally
  expect(getVersionOfRange(makeResolvedDepWithMajors(), 'minor', excludeOptions)).toBe('6.5.0')

  // without the exclude, the excluded major would have been offered
  expect(getVersionOfRange(makeResolvedDepWithMajors(), 'major', options)).toBe('7.1.0')
})

it('supports multiple `||`-combined ranges in a `name@range` exclude selector', () => {
  const excludeOptions = {
    ...options,
    exclude: ['typescript@7||^8'],
  }
  const dep = makeResolvedDepWithMajors()
  dep.pkgData.versions.push('8.0.0')
  dep.pkgData.tags.latest = '8.0.0'

  expect(getVersionOfRange(dep, 'major', excludeOptions)).toBe('6.5.0')
})

it('still fully excludes a package when no version is given in `exclude`', () => {
  const excludeOptions = {
    ...options,
    exclude: ['typescript'],
  }

  expect(getVersionOfRange(makeResolvedDepWithMajors(), 'major', excludeOptions)).toBeUndefined()
})

it('keeps locked dependencies within patch range in patch mode', async () => {
  const patchOptions = {
    ...options,
    mode: 'patch' as const,
    includeLocked: true,
  }

  const patchUpdate = await resolveDependency(makePkg('4.0.0'), patchOptions, filter)
  expect(patchUpdate.targetVersion).toBe('4.0.5')
  expect(patchUpdate.update).toBe(true)

  const noPatchUpdate = await resolveDependency(makePkg('4.0.5'), patchOptions, filter)
  expect(noPatchUpdate.targetVersion).toBe('4.0.5')
  expect(noPatchUpdate.update).toBe(false)
  expect(noPatchUpdate.latestVersionAvailable).toBe('6.0.0')
})

it('resolveDependency', async () => {
  // default
  expect(false).toBe((await resolveDependency(makePkg(''), options, filter)).update)
  expect(false).toBe((await resolveDependency(makePkg('*'), options, filter)).update)
  expect(false).toBe((await resolveDependency(makePkg('4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('^4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('>4.0.0'), options, filter)).update)

  options.mode = 'major'
  // major
  expect(false).toBe((await resolveDependency(makePkg(''), options, filter)).update)
  expect(false).toBe((await resolveDependency(makePkg('*'), options, filter)).update)
  expect(false).toBe((await resolveDependency(makePkg('4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('^4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('>4.0.0'), options, filter)).update)

  options.mode = 'minor'
  // minor
  expect(false).toBe((await resolveDependency(makePkg(''), options, filter)).update)
  expect(false).toBe((await resolveDependency(makePkg('*'), options, filter)).update)
  expect(false).toBe((await resolveDependency(makePkg('4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('^4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('>4.0.0'), options, filter)).update)

  options.mode = 'patch'
  // patch
  expect(false).toBe((await resolveDependency(makePkg(''), options, filter)).update)
  expect(false).toBe((await resolveDependency(makePkg('*'), options, filter)).update)
  expect(false).toBe((await resolveDependency(makePkg('4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('^4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('>4.0.0'), options, filter)).update)

  options.mode = 'latest'
  // latest
  expect(false).toBe((await resolveDependency(makePkg(''), options, filter)).update)
  expect(false).toBe((await resolveDependency(makePkg('*'), options, filter)).update)
  expect(false).toBe((await resolveDependency(makePkg('4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('^4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('>4.0.0'), options, filter)).update)

  options.mode = 'newest'
  // newest
  expect(false).toBe((await resolveDependency(makePkg(''), options, filter)).update)
  expect(false).toBe((await resolveDependency(makePkg('*'), options, filter)).update)
  expect(false).toBe((await resolveDependency(makePkg('4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('^4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('>4.0.0'), options, filter)).update)

  options.mode = 'stable'
  // stable
  expect(false).toBe((await resolveDependency(makePkg(''), options, filter)).update)
  expect(false).toBe((await resolveDependency(makePkg('*'), options, filter)).update)
  expect(false).toBe((await resolveDependency(makePkg('4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('^4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkg('>4.0.0'), options, filter)).update)

  // include locked
  options.mode = 'newest'
  options.includeLocked = true
  expect(true).toBe((await resolveDependency(makePkg('4.0.0'), options, filter)).update)

  expect((await resolveDependency(makePkg(''), options, filter)).targetVersion)
    .toMatch('')
  expect((await resolveDependency(makePkg('workspace:*'), options, filter)).targetVersion)
    .toMatch('workspace:*')
  expect((await resolveDependency(makePkg('workspace:*'), options, filter)).resolveError)
    .toBeUndefined()
  expect((await resolveDependency(makePkg('random'), options, filter)).targetVersion)
    .toMatch('random')
  expect((await resolveDependency(makePkg('random'), options, filter)).resolveError)
    .toBeUndefined()

  // local pkg
  expect(false).toBe((await resolveDependency(makeLocalPkg('file:../aaa'), options, filter)).update)
  expect(false).toBe((await resolveDependency(makeLocalPkg('link:../aaa'), options, filter)).update)
  expect(false).toBe((await resolveDependency(makeLocalPkg('workspace:*'), options, filter)).update)
  const target = await resolveDependency(makeLocalPkg('1.0.0'), options, filter)
  expect(target.resolveError).not.toBeNull()

  // yarn resolutions
  expect(true).toBe((await resolveDependency(makePkgForResolutions('typescript', '^4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkgForResolutions('typescript@5.0.0', '^4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkgForResolutions('typescript', 'npm:typescript@^4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkgForResolutions('foo/typescript', '^4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkgForResolutions('foo/**/typescript', '^4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkgForResolutions('**/typescript', '^4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkgForResolutions('@foo/bar/typescript', '^4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkgForResolutions('@foo/bar/typescript@5.1.0', '^4.0.0'), options, filter)).update)

  // pnpm overrides
  expect(true).toBe((await resolveDependency(makePkgForPnpmOverrides('typescript', '^4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkgForPnpmOverrides('typescript', 'npm:typescript@^4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkgForPnpmOverrides('typescript@5.0.0', '^4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkgForPnpmOverrides('foo@1>typescript', '^4.0.0'), options, filter)).update)
  expect(true).toBe((await resolveDependency(makePkgForPnpmOverrides('typescript@>=4.0.0 <5.0.0', '^4.0.0'), options, filter)).update)
})

it('resolves a provenance downgrade for a package published without provenance after being trusted-published', async () => {
  const provenanceResult = await resolveDependency({
    name: '@test-zone/provenance',
    currentVersion: '0.0.1',
    source: 'dependencies',
    update: true,
  }, options, filter)

  expect(provenanceResult).toMatchObject({
    name: '@test-zone/provenance',
    provenanceDowngraded: true,
    currentVersion: '0.0.1',
    currentProvenance: 'trustedPublisher',
    targetVersion: '0.0.2',
    targetProvenance: undefined,
  })
})

it('marks trusted publisher provenance downgrade', () => {
  const dep: ResolvedDepChange = {
    name: 'trusted-publisher-package',
    currentVersion: '1.0.0',
    source: 'dependencies',
    update: true,
    targetVersion: '1.0.0',
    diff: null,
    provenanceDowngraded: false,
    pkgData: {
      tags: {
        latest: '1.1.0',
      },
      versions: ['1.0.0', '1.1.0'],
      provenance: {
        '1.0.0': 'trustedPublisher',
        '1.1.0': true,
      },
    },
  }

  updateTargetVersion(dep, '1.1.0', true, true)

  expect(dep.currentProvenance).toBe('trustedPublisher')
  expect(dep.targetProvenance).toBe(true)
  expect(dep.provenanceDowngraded).toBe(true)
})

it('getDiff', () => {
  // normal
  expect(getDiff('1.2.3', '1.2.3')).toBe(null)
  expect(getDiff('1.2.3', '1.2.4')).toBe('patch')
  expect(getDiff('1.2.3', '1.3.3')).toBe('minor')
  expect(getDiff('1.2.3', '2.2.3')).toBe('major')

  // 0.x
  expect(getDiff('0.1.2', '0.1.3')).toBe('patch')
  expect(getDiff('0.1.2', '0.2.2')).toBe('major')
  expect(getDiff('0.0.3', '0.0.4')).toBe('major')

  // pre
  expect(getDiff('1.2.3-a', '1.2.3')).toBe('patch')
  expect(getDiff('1.2.3-a', '1.2.4')).toBe('patch')
  expect(getDiff('1.2.2', '1.2.3-a')).toBe('patch')
  expect(getDiff('1.2.3-a', '1.2.3-b')).toBe('patch')
  expect(getDiff('1.2.3-a', '1.2.4-b')).toBe('patch')
  expect(getDiff('1.2.3-a', '1.3.3-a')).toBe('minor')
  expect(getDiff('1.2.3-a', '2.2.3-a')).toBe('major')
  expect(getDiff('2.0.0-a', '2.0.0')).toBe('patch')
})

it('filters interactive candidate versions by maturity period', () => {
  const dep = makeResolvedDepForMaturityPeriod()
  const maturityOptions = {
    ...options,
    maturityPeriod: 1,
  }

  expect(getLatestVersionAvailable(dep, '1.1.0', maturityOptions)).toBeUndefined()
  expect(getLatestVersionAvailable(dep, '1.0.0', maturityOptions)).toBe('1.1.0')

  expect(getVersionOfTag(dep, 'latest', maturityOptions)).toBe('1.1.0')
  expect(getVersionOfTag(dep, 'stable', maturityOptions)).toBe('1.1.0')
  expect(getVersionOfTag(dep, 'beta', maturityOptions)).toBeUndefined()
})

it('does not offer mature prereleases when stable latest is blocked by maturity period', () => {
  const dep = makeResolvedDepWithMaturePrereleaseFallback()
  const maturityOptions = {
    ...options,
    maturityPeriod: 1,
  }

  expect(getVersionOfTag(dep, 'latest', maturityOptions)).toBe('1.2.5')
  expect(getLatestVersionAvailable(dep, '1.2.5', maturityOptions)).toBeUndefined()
})

it('offers mature prereleases when current is on a prerelease track and stable latest is blocked by maturity period', () => {
  const dep = makeResolvedDepOnPrereleaseTrack()
  const maturityOptions = {
    ...options,
    maturityPeriod: 1,
  }

  expect(getVersionOfTag(dep, 'latest', maturityOptions)).toBe('2.0.0-rc.3')
  expect(getLatestVersionAvailable(dep, '2.0.0-rc.1', maturityOptions)).toBe('2.0.0-rc.3')
})

it('excludes packages from the maturity period filter', () => {
  const maturityOptions = {
    ...options,
    maturityPeriod: 1,
    maturityPeriodExclude: ['test-*'],
  }

  expect(getLatestVersionAvailable(makeResolvedDepForMaturityPeriod(), '1.1.0', maturityOptions)).toBe('1.2.0')
  expect(getVersionOfTag(makeResolvedDepForMaturityPeriod(), 'latest', maturityOptions)).toBe('1.2.0')
  expect(getVersionOfTag(makeResolvedDepForMaturityPeriod(), 'beta', maturityOptions)).toBe('1.2.0')
})

it('excludes package versions from the maturity period filter', () => {
  const maturityOptions = {
    ...options,
    maturityPeriod: 1,
    maturityPeriodExclude: ['test-package@1.2.0'],
  }

  expect(getVersionOfTag(makeResolvedDepForMaturityPeriod(), 'latest', maturityOptions)).toBe('1.2.0')
  expect(getVersionOfTag(makeResolvedDepForMaturityPeriod(), 'beta', maturityOptions)).toBe('1.2.0')
})
