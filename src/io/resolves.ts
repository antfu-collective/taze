import pacote, { Packument } from 'pacote'
import semver from 'semver'
import { npmConfig } from '../utils/npm'
import { RawDependency, ResolvedDependencies, PackageMeta, RangeMode, DependencyFilter, ProgressCallback } from '../types'
import { diffSorter } from '../filters/diff-sorter'
import { getMaxSatisfying } from '../utils/versions'

interface PackageData {
  tags: Record<string, string>
  versions: string[]
  time?: Record<string, string>
  raw?: Packument
  error?: Error | string
}

const versionCache: Record<string, Packument> = {}

export async function getPackageData(name: string): Promise<PackageData> {
  let error: any

  if (!versionCache[name]) {
    try {
      versionCache[name] = await pacote.packument(name, { ...npmConfig, fullMetadata: true })
    }
    catch (e) {
      error = e
    }
  }

  const data = versionCache[name]
  if (!data) {
    return {
      tags: {},
      versions: [],
      error: error?.statusCode?.toString() || error,
    }
  }

  return {
    tags: data['dist-tags'],
    versions: Object.keys(data.versions || {}),
    time: data.time,
    raw: data,
  }
}

export async function resolveDependency(
  raw: RawDependency,
  mode: RangeMode,
  filter: DependencyFilter = () => true,
) {
  if (!raw.update || !await Promise.resolve(filter(raw))) {
    return {
      ...raw,
      diff: null,
      targetVersion: raw.currentVersion,
      update: false,
    } as ResolvedDependencies
  }

  const dep = { ...raw } as ResolvedDependencies
  const { versions, tags, error, time = {} } = await getPackageData(dep.name)
  let err: Error | string | null = null
  let max: {version: string; prefix: string | null; prefixed: string | null} | null = null

  if (error == null) {
    try {
      max = getMaxSatisfying(versions, dep.currentVersion, mode, tags)
    }
    catch (e) {
      err = e.message || e
    }
  }
  else {
    err = error
  }

  if (err == null && max?.prefixed) {
    dep.targetVersion = max.prefixed
    dep.targetVersionTime = time[max.version]

    const current = semver.minVersion(dep.currentVersion)!
    const latest = semver.minVersion(dep.targetVersion)!

    dep.currentVersionTime = time[current.toString()]
    dep.diff = semver.diff(current, latest)
    dep.update = dep.diff !== null && semver.lt(current, latest)
  }
  else {
    dep.targetVersion = dep.currentVersion
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
