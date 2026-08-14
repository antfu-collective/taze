import type { CheckOptions, DependencyFilter, PackageData, Protocol, RangeMode, RawDep, ResolvedDepChange, RetryOptions } from '../../types'
import process from 'node:process'
import { findMinimumForRange, isGreater, isLess, satisfies } from 'verkit'
import { getExcludeVersionRanges, getMaturityPeriodExcludeRanges, isVersionInExcludedRanges } from '../../utils/config'
import { parsePnpmPackagePath, parseYarnPackagePath } from '../../utils/package'
import { fetchJsrPackageMeta, fetchPackage } from '../../utils/packument'
import { filterDeprecatedVersions, filterVersionsByMaturityPeriod, getMaxSatisfying, getPrefixedVersion } from '../../utils/versions'
import { cache, cacheTTL, debug, inflightRequests, markCacheChanged, now, ttl } from '../cache'
import { getDiff, mergeMode } from '../shared'

export async function getPackageData(name: string, protocol: Protocol = 'npm', cwd?: string, requestTimeout?: number, retry?: number | false | RetryOptions, fastNpmMetaApiEndpoint?: string): Promise<PackageData> {
  let error: any
  const cacheName = protocol === 'npm' && fastNpmMetaApiEndpoint
    ? `${protocol}:${fastNpmMetaApiEndpoint}:${name}`
    : `${protocol}:${name}`

  if (cache[cacheName]) {
    if (ttl(cache[cacheName].cacheTime) < cacheTTL) {
      debug.cache(`cache hit for ${cacheName}`)
      return cache[cacheName].data
    }
    else {
      delete cache[cacheName]
    }
  }

  const inflightRequest = inflightRequests.get(cacheName)

  if (inflightRequest) {
    debug.cache(`in-flight hit for ${cacheName}`)
    return inflightRequest
  }

  const request = (async () => {
    try {
      debug.resolve(`resolving ${cacheName}`)
      const data = protocol === 'jsr'
        ? await fetchJsrPackageMeta(name, requestTimeout)
        : await fetchPackage(name, false, cwd, requestTimeout, retry, fastNpmMetaApiEndpoint)

      if (data) {
        cache[cacheName] = { data, cacheTime: now() }
        markCacheChanged()
        return data
      }
    }
    catch (e) {
      error = e
    }

    return {
      tags: {},
      versions: [],
      error: error?.statusCode?.toString() || error,
      deprecated: {},
    }
  })()

  inflightRequests.set(cacheName, request)

  try {
    return await request
  }
  finally {
    inflightRequests.delete(cacheName)
  }
}

export function getVersionOfRange(dep: ResolvedDepChange, range: RangeMode, options: CheckOptions) {
  const { tags } = dep.pkgData
  const filteredVersions = getFilteredVersions(dep, options)

  if (filteredVersions.length === 0) {
    return undefined
  }

  dep.filteredVersions = filteredVersions

  return getMaxSatisfying(filteredVersions, dep.currentVersion, range, tags)
}

function getFilteredVersions(dep: ResolvedDepChange, options: CheckOptions) {
  const { versions, deprecated, time } = dep.pkgData
  let filteredVersions = versions

  if (deprecated && Object.keys(deprecated).length > 0) {
    filteredVersions = filterDeprecatedVersions(filteredVersions, deprecated)
  }

  // `--exclude typescript@7` (or `typescript@^7||^8`) excludes only the matching versions,
  // leaving the rest of the package's versions (e.g. v6) available for updates/interactive mode.
  const excludeVersionRanges = getExcludeVersionRanges(dep.name, options)
  if (excludeVersionRanges === true) {
    filteredVersions = []
  }
  else if (excludeVersionRanges.length > 0) {
    filteredVersions = filteredVersions.filter(version => !isVersionInExcludedRanges(version, excludeVersionRanges))
  }

  const maturityPeriodExclude = getMaturityPeriodExcludeRanges(dep.name, options)
  if (options.maturityPeriod && options.maturityPeriod > 0 && maturityPeriodExclude !== true) {
    const maturityCandidates = filteredVersions
    filteredVersions = filterVersionsByMaturityPeriod(maturityCandidates, time, options.maturityPeriod)

    if (maturityPeriodExclude.length > 0) {
      const filteredVersionSet = new Set(filteredVersions)
      filteredVersions = maturityCandidates.filter(version =>
        filteredVersionSet.has(version)
        || isVersionInExcludedRanges(version, maturityPeriodExclude),
      )
    }
  }

  return filteredVersions
}

export function getVersionOfTag(dep: ResolvedDepChange, tag: string, options: CheckOptions) {
  const version = dep.pkgData.tags[tag]
  if (!version)
    return undefined

  if (tag === 'latest' || tag === 'next')
    return getVersionOfRange(dep, tag, options)

  const filteredVersions = dep.filteredVersions ?? getFilteredVersions(dep, options)
  dep.filteredVersions = filteredVersions

  return filteredVersions.includes(version) ? version : undefined
}

export function getLatestVersionAvailable(dep: ResolvedDepChange, targetVersion: string, options: CheckOptions) {
  const version = getVersionOfRange(dep, 'latest', options)
  return version && isGreater(version, targetVersion) ? version : undefined
}

export function updateTargetVersion(
  dep: ResolvedDepChange,
  version: string,
  forgiving = true,
  includeLocked = false,
) {
  const versionLocked = /^\d+/.test(dep.currentVersion)
  if (versionLocked && !includeLocked) {
    dep.targetVersion = dep.currentVersion
    dep.targetVersionTime = dep.currentVersionTime
    dep.diff = null
    dep.update = false
    return
  }

  dep.targetVersion = getPrefixedVersion(dep.currentVersion, version) || dep.currentVersion
  dep.targetVersionTime = dep.pkgData.time?.[version]
  dep.currentProvenance = dep.pkgData.provenance?.[dep.currentVersion]
  dep.targetProvenance = dep.pkgData.provenance?.[dep.targetVersion]
  dep.provenanceDowngraded
    = !!(dep.currentProvenance && !dep.targetProvenance) // trusted -> none, provenance -> none
      || (dep.currentProvenance === 'trustedPublisher' && dep.targetProvenance === true) // trusted -> provenance

  try {
    const current = findMinimumForRange(dep.currentVersion)!
    const target = findMinimumForRange(dep.targetVersion)!

    dep.currentVersionTime = dep.pkgData.time?.[current]
    dep.diff = getDiff(current, target)
    dep.update = dep.diff !== null && isLess(current, target)
  }
  catch (e) {
    if (!forgiving)
      throw e
    dep.targetVersion = dep.currentVersion
    dep.diff = 'error'
    dep.update = false
  }
}

export function isUrlPackage(currentVersion: string) {
  return /^(?:https?:|git\+|github:)/.test(currentVersion)
}

export function isLocalPackage(currentVersion: string) {
  return /^(?:link|file|workspace|catalog):/.test(currentVersion)
}

function isAliasedPackage(currentVersion: string) {
  return /^(?:npm|jsr):/.test(currentVersion)
}

function parseAliasedPackage(currentVersion: string): { protocol: Protocol, name: string, version: string } {
  const [protocol, rest] = currentVersion.split(':', 2) as [Protocol, string]

  if (protocol === 'npm') {
    const lastAtIndex = rest.lastIndexOf('@')
    if (lastAtIndex > 0) {
      return {
        protocol,
        name: rest.substring(0, lastAtIndex),
        version: rest.substring(lastAtIndex + 1),
      }
    }
    return {
      protocol,
      name: rest,
      version: '',
    }
  }

  return {
    protocol,
    name: '',
    version: rest,
  }
}

async function resolveNpmDependency(
  raw: RawDep,
  options: CheckOptions,
  filter: DependencyFilter = () => true,
): Promise<ResolvedDepChange> {
  const dep = { ...raw } as ResolvedDepChange

  const mergedMode = mergeMode(dep.name, options)
  if (isLocalPackage(raw.currentVersion) || isUrlPackage(raw.currentVersion) || !raw.update || !await Promise.resolve(filter(raw)) || mergedMode === 'ignore') {
    return {
      ...raw,
      diff: null,
      targetVersion: raw.currentVersion,
      update: false,
    } as ResolvedDepChange
  }
  if (isAliasedPackage(raw.currentVersion)) {
    const { name, version, protocol } = parseAliasedPackage(raw.currentVersion)
    dep.name = name || dep.name
    dep.currentVersion = version
    dep.aliasName = raw.name
    dep.protocol = protocol
    if (!version) {
      dep.diff = null
      dep.targetVersion = version
      dep.update = false
      return dep
    }
  }

  let resolvedName = dep.name

  // manage Yarn resolutions (e.g. "foo@1/bar")
  if (dep.source === 'resolutions') {
    const packages = parseYarnPackagePath(dep.name)
    resolvedName = packages.pop() ?? dep.name
  }
  // manage pnpm overrides (e.g. "foo@1>bar")
  else if (dep.source === 'pnpm.overrides') {
    const packages = parsePnpmPackagePath(dep.name)
    resolvedName = packages.pop() ?? dep.name
  }

  const pkgData = await getPackageData(resolvedName, dep.protocol, options.cwd, options.requestTimeout, options.retry, options.fastNpmMetaApiEndpoint)
  const { error, deprecated } = pkgData

  dep.pkgData = pkgData
  let err: Error | string | null = null
  let target: string | undefined

  if (error == null) {
    try {
      if (deprecated && deprecated[dep.currentVersion]) {
        dep.diff = null
        dep.targetVersion = dep.currentVersion
        dep.update = false
        return dep
      }

      const versionLocked = /^\d+/.test(dep.currentVersion)
      // Bare `--include-locked` historically checks exact versions within the minor range.
      // Explicit modes and per-package modes must keep their selected range.
      const targetMode = options.includeLocked && versionLocked && mergedMode === 'default'
        ? 'minor'
        : mergedMode

      target = getVersionOfRange(dep, targetMode as RangeMode, options)

      if (!target) {
        dep.diff = null
        dep.targetVersion = dep.currentVersion
        dep.update = false
        return dep
      }
    }
    catch (e: any) {
      err = e.message || e
    }
  }
  else {
    err = error
  }

  if (target)
    updateTargetVersion(dep, target, undefined, options.includeLocked)
  else
    dep.targetVersion = dep.currentVersion

  if (dep.targetVersion === dep.currentVersion) {
    dep.diff = null
    dep.update = false
  }

  try {
    const targetVersion = findMinimumForRange(target || dep.targetVersion)
    if (targetVersion)
      dep.latestVersionAvailable = getLatestVersionAvailable(dep, targetVersion, options)

    const { nodecompat = true } = options
    if (nodecompat) {
      const currentNodeVersion = process.version
      const { nodeSemver } = dep.pkgData
      if (nodeSemver
        && targetVersion
        && targetVersion in nodeSemver) {
        dep.nodeCompatibleVersion = {
          compatible: satisfies(currentNodeVersion, nodeSemver[targetVersion]),
          semver: nodeSemver[targetVersion],
        }
      }
    }
  }
  catch {}

  if (err) {
    dep.diff = 'error'
    dep.update = false
    dep.resolveError = err
    return dep
  }

  return dep
}

export const npmRegistry = {
  name: 'npm' as const,
  resolve: resolveNpmDependency,
  getDiff,
}
