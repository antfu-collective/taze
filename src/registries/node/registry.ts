import type { CheckOptions, DependencyFilter, DiffType, PackageData, RangeMode, RawDep, ResolvedDepChange } from '../../types'
import { getExcludeVersionRanges, getMaturityPeriodExcludeRanges, isVersionInExcludedRanges } from '../../utils/config'
import { fetchNodeReleases } from '../../utils/node'
import { compareVersionReferences, formatVersionReference, parseVersionReference, selectVersionTarget } from '../../utils/versionReference'
import { cache, cacheTTL, debug, inflightRequests, markCacheChanged, now, ttl } from '../cache'
import { mergeMode } from '../shared'

const CACHE_NAME = 'node'

async function getNodeReleaseData(requestTimeout?: number): Promise<PackageData> {
  if (cache[CACHE_NAME]) {
    if (ttl(cache[CACHE_NAME].cacheTime) < cacheTTL) {
      debug.cache(`cache hit for ${CACHE_NAME}`)
      return cache[CACHE_NAME].data
    }
    else {
      delete cache[CACHE_NAME]
    }
  }

  const inflightRequest = inflightRequests.get(CACHE_NAME)
  if (inflightRequest) {
    debug.cache(`in-flight hit for ${CACHE_NAME}`)
    return inflightRequest
  }

  const request = (async () => {
    try {
      debug.resolve(`resolving ${CACHE_NAME}`)
      const data = await fetchNodeReleases(requestTimeout)
      cache[CACHE_NAME] = { data, cacheTime: now() }
      markCacheChanged()
      return data
    }
    catch (error: any) {
      return {
        tags: {},
        versions: [],
        error: error?.statusCode?.toString() || error?.message || error,
      } satisfies PackageData
    }
  })()

  inflightRequests.set(CACHE_NAME, request)
  try {
    return await request
  }
  finally {
    inflightRequests.delete(CACHE_NAME)
  }
}

/**
 * `stable` behaves like `minor` for Node.js: stay within the current major.
 */
function getNodeRangeMode(mode: RangeMode): RangeMode {
  return mode === 'stable' ? 'minor' : mode
}

/**
 * Diff between two Node.js references (`22` -> `24`, `v22.14.0` -> `v22.15.0`).
 */
export function getNodeDiff(current: string, target: string): DiffType {
  const a = parseVersionReference(current)
  const b = parseVersionReference(target)
  if (!a || !b)
    return 'error'
  if (compareVersionReferences({ ...a, prerelease: false }, { ...b, prerelease: false }) === 0)
    return null
  if (a.major !== b.major)
    return 'major'
  if (a.minor !== b.minor)
    return 'minor'
  return 'patch'
}

async function resolveNodeVersion(
  raw: RawDep,
  options: CheckOptions,
  filter: DependencyFilter = () => true,
): Promise<ResolvedDepChange> {
  const dep = { ...raw } as ResolvedDepChange
  dep.provenanceDowngraded = false

  const mode = mergeMode(raw.name, options, options.mode ?? 'default')

  const noUpdate = (): ResolvedDepChange => {
    dep.diff = null
    dep.targetVersion = raw.currentVersion
    dep.update = false
    return dep
  }

  if (!raw.update || mode === 'ignore' || !await Promise.resolve(filter(raw)))
    return noUpdate()

  const excludeRanges = getExcludeVersionRanges(raw.name, options)
  if (excludeRanges === true)
    return noUpdate()

  const current = parseVersionReference(raw.currentVersion)
  if (!current)
    return noUpdate()

  const pkgData = await getNodeReleaseData(options.requestTimeout)
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

  const reject = (parsed: { raw: string }) => {
    if (excludeRanges.length > 0 && isVersionInExcludedRanges(parsed.raw.replace(/^v/, ''), excludeRanges))
      return true
    if (cutoff > 0 && maturityExclude !== true) {
      const date = pkgData.time?.[parsed.raw]
      const isMaturityExcluded = maturityExclude.length > 0
        && isVersionInExcludedRanges(parsed.raw.replace(/^v/, ''), maturityExclude)
      if (!isMaturityExcluded && date && new Date(date).getTime() > cutoff)
        return true
    }
    return false
  }

  const picked = selectVersionTarget(raw.currentVersion, pkgData.versions, getNodeRangeMode(mode as RangeMode), { reject })

  // Surface a "newer major available" hint even when the current mode keeps us
  // on the same major line.
  const latest = selectVersionTarget(raw.currentVersion, pkgData.versions, 'newest', { reject })
  if (latest && latest.target !== picked?.target)
    dep.latestVersionAvailable = latest.target

  if (!picked || picked.target === raw.currentVersion)
    return noUpdate()

  dep.targetVersion = picked.target
  dep.targetVersionTime = pkgData.time?.[picked.resolvedVersion]
  dep.diff = getNodeDiff(raw.currentVersion, picked.target)
  dep.update = dep.diff !== null && dep.diff !== 'error'

  if (current.segments === 3)
    dep.currentVersionTime = pkgData.time?.[`${current.prefix || 'v'}${current.major}.${current.minor}.${current.patch}`]

  return dep
}

export const nodeRegistry = {
  name: 'node' as const,
  resolve: resolveNodeVersion,
  getDiff: getNodeDiff,
}

export { formatVersionReference, parseVersionReference }
