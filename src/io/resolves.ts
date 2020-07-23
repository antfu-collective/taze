import pacote from 'pacote'
import semver from 'semver'
import { npmConfig } from '../utils/npm'
import { RawDependency, ResolvedDependencies, PackageMeta, RangeMode, DependencyFilter, ProgressCallback } from '../types'
import { diffSorter } from '../filters/diff-sorter'

interface PackageCache {
  tags: Record<string, string>
  versions: string[]
  error?: number | Error
}
const versionCache: Record<string, PackageCache > = {}

export async function getLatestVersions(name: string) {
  if (versionCache[name])
    return versionCache[name]
  try {
    const data = await pacote.packument(name, { ...npmConfig })
    versionCache[name] = {
      tags: data['dist-tags'],
      versions: Object.keys(data.versions || {}),
    }
    return versionCache[name]
  }
  catch (e) {
    versionCache[name] = {
      tags: {},
      versions: [],
      error: e.statusCode || e,
    }
    return versionCache[name]
  }
}

export function resetRange(version: string, mode: Exclude<RangeMode, 'latest'>) {
  if (mode === 'newest')
    return '*'

  if (!semver.validRange(version))
    return null

  if (mode === 'default')
    return version

  const min = semver.minVersion(version)
  if (!min)
    return null

  return {
    major: '>=',
    minor: '^',
    patch: '~',
  }[mode] + min
}

export function resolveVersion(version: string) {
  semver.parse(version)
}

export async function resolveDependency(
  raw: RawDependency,
  mode: RangeMode,
  filter: DependencyFilter = () => true,
) {
  if (!await Promise.resolve(filter(raw))) {
    return {
      ...raw,
      diff: null,
      latestVersion: raw.currentVersion,
      update: false,
    } as ResolvedDependencies
  }

  const dep = { ...raw } as ResolvedDependencies
  const { versions, tags, error } = await getLatestVersions(dep.name)
  const range = mode === 'latest' ? tags.latest : resetRange(dep.currentVersion, mode)
  if (range && !error) {
    const max = dep.currentVersion === '*'
      ? '*' // leave it as-is
      : semver.maxSatisfying(versions, range)

    // TODO: align the range
    dep.latestVersion = max ? `^${max}` : dep.currentVersion
    dep.diff = semver.diff(semver.minVersion(dep.currentVersion)!, semver.minVersion(dep.latestVersion)!)
    dep.update = dep.diff !== null
  }
  else {
    dep.latestVersion = dep.currentVersion
    dep.diff = 'error'
    dep.update = false
    dep.resolveError = error ?? 'invalid_range'
  }
  return dep
}

export async function resolveDependencies(
  deps: RawDependency[],
  mode: RangeMode,
  filter: DependencyFilter = () => true,
  progressCallback: ProgressCallback = (i: number) => {},
) {
  const total = deps.length
  let counter = 0

  return Promise.all(
    deps
      .map(async(raw) => {
        const dep = await resolveDependency(raw, mode, filter)
        counter += 1
        progressCallback(counter, total, raw.name)
        return dep
      }),
  )
}

export async function resolvePackage(pkg: PackageMeta, mode: RangeMode, filter?: DependencyFilter, progress?: ProgressCallback) {
  const resolved = await resolveDependencies(pkg.deps, mode, filter, progress)
  diffSorter(resolved)
  pkg.resolved = resolved
  return pkg
}
