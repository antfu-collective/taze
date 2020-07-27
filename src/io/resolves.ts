import pacote from 'pacote'
import semver from 'semver'
import { npmConfig } from '../utils/npm'
import { RawDependency, ResolvedDependencies, PackageMeta, RangeMode, DependencyFilter, ProgressCallback } from '../types'
import { diffSorter } from '../filters/diff-sorter'
import { getMaxSatisfying } from '../utils/versions'

interface PackageCache {
  tags: Record<string, string>
  versions: string[]
  error?: Error | string
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
      error: e?.statusCode?.toString() || e,
    }
    return versionCache[name]
  }
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
  let err: Error | string | null = null
  let max: string | null = null

  if (error == null) {
    try {
      max = mode === 'latest'
        ? tags.latest
        : getMaxSatisfying(versions, dep.currentVersion, mode)
    }
    catch (e) {
      err = e.message || e
    }
  }
  else {
    err = error
  }

  if (err != null && max) {
    dep.latestVersion = max
    const current = semver.minVersion(dep.currentVersion)!
    const latest = semver.minVersion(dep.latestVersion)!

    dep.diff = semver.diff(current, latest)
    dep.update = dep.diff !== null && semver.lt(current, latest)
  }
  else {
    dep.latestVersion = dep.currentVersion
    dep.diff = 'error'
    dep.update = false
    dep.resolveError = err
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
