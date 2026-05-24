import type { CheckOptions, DependencyFilter, DependencyResolvedCallback, DiffType, PackageData, PackageMeta, Protocol, RangeMode, RawDep, ResolvedDepChange } from '../types'
import { existsSync, promises as fs, lstatSync } from 'node:fs'
import os from 'node:os'
import process from 'node:process'
import { newQueue } from '@henrygd/queue'
import { createDebug } from 'obug'
import { resolve } from 'pathe'
import { findMinimumForRange, isEqual, isGreater, isLess, satisfies } from 'verkit'
import { diffSorter } from '../filters/diff-sorter'
import { getMaturityPeriodExcludeRanges, getPackageMode, isVersionMaturityPeriodExcluded } from '../utils/config'
import { queueContext } from '../utils/context'
import { parsePnpmPackagePath, parseYarnPackagePath } from '../utils/package'
import { fetchJsrPackageMeta, fetchPackage } from '../utils/packument'

import { filterDeprecatedVersions, filterVersionsByMaturityPeriod, getMaxSatisfying, getPrefixedVersion } from '../utils/versions'

const debug = {
  cache: createDebug('taze:cache'),
  resolve: createDebug('taze:resolve'),
}

let cache: Record<string, { cacheTime: number, data: PackageData }> = {}
let cacheChanged = false
const inflightRequests = new Map<string, Promise<PackageData>>()

const cacheDir = resolve(os.tmpdir(), 'taze')
const cachePath = resolve(cacheDir, 'cache.json')
const cacheTTL = 30 * 60_000 // 30min

function now() {
  return Date.now()
}

function ttl(n: number) {
  return now() - n
}

export async function loadCache() {
  if (existsSync(cachePath) && ttl(lstatSync(cachePath).mtimeMs) < cacheTTL) {
    debug.cache(`cache loaded from ${cachePath}`)
    cache = JSON.parse(await fs.readFile(cachePath, 'utf-8'))
  }
  else {
    debug.cache('no cache found')
  }
}

export async function dumpCache() {
  if (!cacheChanged)
    return
  try {
    await fs.mkdir(cacheDir, { recursive: true })
    await fs.writeFile(cachePath, JSON.stringify(cache), 'utf-8')
    debug.cache(`cache saved to ${cachePath}`)
  }
  catch (err) {
    console.warn('Failed to save cache')
    console.warn(err)
  }
}

export async function getPackageData(name: string, protocol: Protocol = 'npm', cwd?: string, requestTimeout?: number): Promise<PackageData> {
  let error: any
  const cacheName = `${protocol}:${name}`

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
        : await fetchPackage(name, false, cwd, requestTimeout)

      if (data) {
        cache[cacheName] = { data, cacheTime: now() }
        cacheChanged = true
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

export function getFilteredVersions(dep: ResolvedDepChange, options: CheckOptions) {
  const { versions, deprecated, time } = dep.pkgData
  let filteredVersions = versions

  if (deprecated && Object.keys(deprecated).length > 0) {
    filteredVersions = filterDeprecatedVersions(filteredVersions, deprecated)
  }

  const maturityPeriodExclude = getMaturityPeriodExcludeRanges(dep.name, options)
  if (options.maturityPeriod && options.maturityPeriod > 0 && maturityPeriodExclude !== true) {
    const maturityCandidates = filteredVersions
    filteredVersions = filterVersionsByMaturityPeriod(maturityCandidates, time, options.maturityPeriod)

    if (maturityPeriodExclude.length > 0) {
      const filteredVersionSet = new Set(filteredVersions)
      filteredVersions = maturityCandidates.filter(version =>
        filteredVersionSet.has(version)
        || isVersionMaturityPeriodExcluded(version, maturityPeriodExclude),
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

  if (versionLocked && isEqual(dep.currentVersion, dep.targetVersion)) {
    // for example: `taze`/`taze -P` is default mode (and it matched from patch to minor)
    // - but this mode will always ignore the locked pkgs
    // - so we need to reset the target
    const { versions, time = {}, tags } = dep.pkgData
    const targetVersion = getMaxSatisfying(dep.filteredVersions ?? versions, dep.currentVersion, 'minor', tags)
    if (targetVersion) {
      dep.targetVersion = targetVersion
      dep.targetVersionTime = time[dep.targetVersion]
    }
  }

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

export function getDiff(current: string, target: string): DiffType {
  if (isEqual(current, target))
    return null

  const tilde = satisfies(target, `~${current}`, { includePrerelease: true })
  const caret = satisfies(target, `^${current}`, { includePrerelease: true })
  const gte = satisfies(target, `>=${current}`, { includePrerelease: true })

  if (tilde) {
    if (caret)
      return 'patch'
    else
      return 'major'
  }
  else if (caret) {
    return 'minor'
  }
  else if (gte) {
    return 'major'
  }

  return 'error'
}

export async function resolveDependency(
  raw: RawDep,
  options: CheckOptions,
  filter: DependencyFilter = () => true,
) {
  const dep = { ...raw } as ResolvedDepChange

  const configMode = getPackageMode(dep.name, options)
  const optionMode = options.mode
  const mergeMode = configMode
    ? (configMode === optionMode)
        ? optionMode
        : optionMode === 'default' ? configMode : 'ignore'
    : optionMode
  if (isLocalPackage(raw.currentVersion) || isUrlPackage(raw.currentVersion) || !raw.update || !await Promise.resolve(filter(raw)) || mergeMode === 'ignore') {
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

  const pkgData = await getPackageData(resolvedName, dep.protocol, options.cwd, options.requestTimeout)
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

      target = getVersionOfRange(dep, mergeMode as RangeMode, options)

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

export async function resolveDependencies(
  deps: RawDep[],
  options: CheckOptions,
  filter: DependencyFilter = () => true,
  progressCallback: (name: string, counter: number, total: number) => void = () => {},
) {
  const total = deps.length
  let counter = 0

  const {
    concurrency = 10,
  } = options

  // resolveDependencies may be called standalone without going through CheckPackages, so we need
  // to fallback (that respects concurrency option) if it's not in the CheckPackages context.
  const queue = queueContext.getStore() || newQueue(concurrency)

  return Promise.all(
    deps.map(raw => queue.add(async () => {
      const dep = await resolveDependency(raw, options, filter)
      counter += 1
      progressCallback(raw.name, counter, total)
      return dep
    })),
  )
}

export async function resolvePackage(pkg: PackageMeta, options: CheckOptions, filter?: DependencyFilter, progress?: DependencyResolvedCallback) {
  const resolved = await resolveDependencies(pkg.deps, options, filter, (name, counter, total) => progress?.(pkg.name, name, counter, total))
  diffSorter(resolved)
  pkg.resolved = resolved
  return pkg
}

export function isUrlPackage(currentVersion: string) {
  return /^(?:https?:|git\+|github:)/.test(currentVersion)
}

export function isLocalPackage(currentVersion: string) {
  return /^(?:link|file|workspace|catalog):/.test(currentVersion)
}

export function isAliasedPackage(currentVersion: string) {
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
