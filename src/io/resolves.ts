import type { CheckOptions, DependencyFilter, DependencyResolvedCallback, DiffType, PackageData, PackageMeta, Protocol, RangeMode, RawDep, ResolvedDepChange, RetryOptions } from '../types'
import { existsSync, promises as fs, lstatSync } from 'node:fs'
import os from 'node:os'
import process from 'node:process'
import { newQueue } from '@henrygd/queue'
import { createDebug } from 'obug'
import { resolve } from 'pathe'
import { coerce, findMinimumForRange, isEqual, isGreater, isLess, isValid, satisfies } from 'verkit'
import { diffSorter } from '../filters/diff-sorter'
import { getExcludeVersionRanges, getMaturityPeriodExcludeRanges, getPackageMode, isVersionInExcludedRanges } from '../utils/config'
import { nodeReleaseDataContext, queueContext } from '../utils/context'
import { fetchActionTags, fetchCommitDate, selectTarget } from '../utils/github'
import { fetchNodeReleases } from '../utils/node'
import { parsePnpmPackagePath, parseYarnPackagePath } from '../utils/package'
import { fetchJsrPackageMeta, fetchPackage } from '../utils/packument'
import { compareVersionReferences, formatVersionReference, parseVersionReference, selectVersionTarget } from '../utils/versionReference'

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

export function invalidateNodeReleaseCache() {
  delete cache.node
  cacheChanged = true
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

export async function getGitHubActionData(repo: string, requestTimeout?: number): Promise<PackageData> {
  const cacheName = `gha:${repo}`

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
    debug.resolve(`resolving ${cacheName}`)
    const { versions, shaMap, error } = await fetchActionTags(repo, requestTimeout)
    const data: PackageData = {
      versions,
      tags: versions.length ? { latest: versions[versions.length - 1] } : {},
      shaMap,
      error,
    }
    if (!error) {
      cache[cacheName] = { data, cacheTime: now() }
      cacheChanged = true
    }
    return data
  })()

  inflightRequests.set(cacheName, request)

  try {
    return await request
  }
  finally {
    inflightRequests.delete(cacheName)
  }
}

export async function getNodeReleaseData(requestTimeout?: number, force = false): Promise<PackageData> {
  const cacheName = 'node'

  if (force)
    invalidateNodeReleaseCache()

  if (cache[cacheName] && ttl(cache[cacheName].cacheTime) < cacheTTL) {
    debug.cache(`cache hit for ${cacheName}`)
    return cache[cacheName].data
  }

  const inflightRequest = inflightRequests.get(cacheName)
  if (inflightRequest)
    return inflightRequest

  const request = (async () => {
    try {
      debug.resolve(`resolving ${cacheName}`)
      const data = await fetchNodeReleases(requestTimeout)
      cache[cacheName] = { data, cacheTime: now() }
      cacheChanged = true
      return data
    }
    catch (error: any) {
      return {
        tags: {},
        versions: [],
        error: error?.statusCode?.toString() || error?.message || error,
      }
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

export async function resolveGitHubAction(
  raw: RawDep,
  options: CheckOptions,
  filter: DependencyFilter = () => true,
): Promise<ResolvedDepChange> {
  const dep = { ...raw } as ResolvedDepChange
  dep.provenanceDowngraded = false

  const info = raw.githubAction
  const configMode = getPackageMode(raw.name, options)
  const optionMode = options.mode ?? 'default'
  const mode = (configMode
    ? (configMode === optionMode
        ? optionMode
        : optionMode === 'default' ? configMode : 'ignore')
    : optionMode) as RangeMode | 'ignore'

  const noUpdate = (): ResolvedDepChange => {
    dep.diff = null
    dep.targetVersion = raw.currentVersion
    dep.update = false
    return dep
  }

  if (!info || !raw.update || mode === 'ignore' || !await Promise.resolve(filter(raw)))
    return noUpdate()

  const excludeRanges = getExcludeVersionRanges(raw.name, options)
  if (excludeRanges === true)
    return noUpdate()

  const pkgData = await getGitHubActionData(info.repo, options.requestTimeout)
  dep.pkgData = pkgData

  if (pkgData.error) {
    dep.diff = 'error'
    dep.update = false
    dep.resolveError = pkgData.error
    return dep
  }

  const maturityExclude = getMaturityPeriodExcludeRanges(raw.name, options)
  const maturityDays = options.maturityPeriod ?? 0
  const cutoff = maturityDays > 0 ? Date.now() - maturityDays * 24 * 60 * 60 * 1000 : 0

  const rejectedForMaturity = new Set<string>()
  let target: { tag: string, resolvedTag: string } | undefined

  while (true) {
    const candidateTags = pkgData.versions.filter(t => !rejectedForMaturity.has(t))
    const picked = selectTarget(raw.currentVersion, candidateTags, mode as RangeMode, {
      reject: (parsed) => {
        if (excludeRanges.length > 0) {
          const coerced = coerce(parsed.raw)
          if (coerced && isVersionInExcludedRanges(coerced, excludeRanges))
            return true
        }
        return false
      },
    })

    if (!picked)
      break

    // supply-chain cool-down: skip versions whose commit is younger than the
    // configured maturity period, stepping down to the next candidate
    if (cutoff > 0 && maturityExclude !== true) {
      const coerced = coerce(picked.resolvedTag)
      const isMaturityExcluded = coerced && maturityExclude.length > 0
        && isVersionInExcludedRanges(coerced, maturityExclude)
      if (!isMaturityExcluded) {
        const sha = pkgData.shaMap?.[picked.resolvedTag]
        const date = sha ? await fetchCommitDate(info.repo, sha, options.requestTimeout) : undefined
        if (date && new Date(date).getTime() > cutoff) {
          rejectedForMaturity.add(picked.resolvedTag)
          continue
        }
        if (date)
          dep.targetVersionTime = date
      }
    }

    target = picked
    break
  }

  if (!target || target.tag === raw.currentVersion)
    return noUpdate()

  dep.targetVersion = target.tag
  dep.diff = getDiff(raw.currentVersion, target.tag)
  dep.update = dep.diff !== null && dep.diff !== 'error'
  dep.githubAction = {
    ...info,
    targetSha: pkgData.shaMap?.[target.tag] ?? pkgData.shaMap?.[target.resolvedTag],
  }

  return dep
}

function getEffectiveMode(name: string, options: CheckOptions): RangeMode | 'ignore' {
  const configMode = getPackageMode(name, options)
  const optionMode = options.mode ?? 'default'
  return configMode
    ? configMode === optionMode
      ? optionMode
      : optionMode === 'default' ? configMode : 'ignore'
    : optionMode
}

function getNodeRangeMode(mode: RangeMode): RangeMode {
  return mode === 'stable' ? 'minor' : mode
}

interface LatestNodeVersionAvailable {
  resolvedVersion: string
  targetVersion: string
}

function getLatestNodeVersionAvailable(
  dep: ResolvedDepChange,
  targetVersion: string,
  options: CheckOptions,
): LatestNodeVersionAvailable | undefined {
  const resolvedVersion = getVersionOfRange(dep, 'latest', options)
  const latest = resolvedVersion && parseVersionReference(resolvedVersion)
  const target = parseVersionReference(targetVersion)
  if (!resolvedVersion || !latest || !target || compareVersionReferences(latest, target) <= 0)
    return

  const formattedTarget = formatResolvedTargetVersion(dep, resolvedVersion)
  if (!formattedTarget)
    return

  return {
    resolvedVersion,
    targetVersion: formattedTarget,
  }
}

export function formatResolvedTargetVersion(dep: Pick<ResolvedDepChange, 'currentVersion' | 'source'>, version: string): string | undefined {
  if (dep.source !== 'node-version')
    return getPrefixedVersion(dep.currentVersion, version) ?? undefined

  const current = parseVersionReference(dep.currentVersion)
  const target = parseVersionReference(version)
  return current && target ? formatVersionReference(target, current) : undefined
}

export async function resolveNodeVersion(
  raw: RawDep,
  options: CheckOptions,
  filter: DependencyFilter = () => true,
): Promise<ResolvedDepChange> {
  const dep = { ...raw, provenanceDowngraded: false } as ResolvedDepChange
  const mode = getEffectiveMode(raw.name, options)
  const noUpdate = (): ResolvedDepChange => {
    dep.diff = null
    dep.targetVersion = raw.currentVersion
    dep.update = false
    return dep
  }

  if (!raw.update || mode === 'ignore' || !await Promise.resolve(filter(raw)))
    return noUpdate()

  if (getExcludeVersionRanges(raw.name, options) === true)
    return noUpdate()

  dep.pkgData = await (nodeReleaseDataContext.getStore() ?? getNodeReleaseData(options.requestTimeout, options.force))
  if (dep.pkgData.error) {
    dep.diff = 'error'
    dep.targetVersion = raw.currentVersion
    dep.update = false
    dep.resolveError = dep.pkgData.error
    return dep
  }

  const target = getVersionOfRange(dep, getNodeRangeMode(mode), options)
  const latest = getLatestNodeVersionAvailable(dep, target ?? raw.currentVersion, options)
  dep.latestVersionAvailable = latest?.targetVersion
  dep.latestVersionAvailableResolved = latest?.resolvedVersion

  if (!target)
    return noUpdate()

  updateTargetVersion(dep, target)
  return dep
}

export function getVersionOfRange(dep: ResolvedDepChange, range: RangeMode, options: CheckOptions) {
  const { tags } = dep.pkgData
  const filteredVersions = getFilteredVersions(dep, options)

  if (filteredVersions.length === 0) {
    return undefined
  }

  dep.filteredVersions = filteredVersions

  if (dep.source === 'node-version') {
    return selectVersionTarget(dep.currentVersion, filteredVersions, getNodeRangeMode(range))?.resolvedVersion
  }

  return getMaxSatisfying(filteredVersions, dep.currentVersion, range, tags)
}

export function getFilteredVersions(dep: ResolvedDepChange, options: CheckOptions) {
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
  if (dep.source === 'node-version')
    return getLatestNodeVersionAvailable(dep, targetVersion, options)?.targetVersion

  const version = getVersionOfRange(dep, 'latest', options)
  return version && isGreater(version, targetVersion) ? version : undefined
}

export function updateTargetVersion(
  dep: ResolvedDepChange,
  version: string,
  forgiving = true,
  includeLocked = false,
) {
  if (dep.source === 'node-version') {
    const targetVersion = formatResolvedTargetVersion(dep, version)
    const current = parseVersionReference(dep.currentVersion)
    const target = parseVersionReference(version)
    if (!targetVersion || !current || !target) {
      dep.targetVersion = dep.currentVersion
      dep.diff = 'error'
      dep.update = false
      return
    }

    dep.targetVersion = targetVersion
    dep.targetVersionTime = dep.pkgData.time?.[version]
    const currentRelease = current.segments === 3
      ? `${current.prefix || 'v'}${current.major}.${current.minor}.${current.patch}`
      : undefined
    dep.currentVersionTime = currentRelease ? dep.pkgData.time?.[currentRelease] : undefined
    dep.diff = getDiff(dep.currentVersion, dep.targetVersion)
    dep.update = dep.diff !== null && dep.diff !== 'error'
      && compareVersionReferences(target, current) > 0
      && dep.targetVersion !== dep.currentVersion
    return
  }

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

export function getDiff(current: string, target: string): DiffType {
  // GitHub Action tags may be partial (e.g. `v4`), which `verkit` cannot parse
  // directly; coerce them to a full semver so the diff can still be computed.
  if (!isValid(current))
    current = coerce(current) ?? current
  if (!isValid(target))
    target = coerce(target) ?? target

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
  if (raw.source === 'github-actions')
    return resolveGitHubAction(raw, options, filter)
  if (raw.source === 'node-version')
    return resolveNodeVersion(raw, options, filter)

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
      const targetMode = options.includeLocked && versionLocked && mergeMode === 'default'
        ? 'minor'
        : mergeMode

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
