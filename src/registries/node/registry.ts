import type { CheckOptions, DependencyFilter, DiffType, PackageData, RangeMode, RawDep, ResolvedDepChange } from '../../types'
import { coerce } from 'verkit'
import { getExcludeVersionRanges, getMaturityPeriodExcludeRanges, isVersionInExcludedRanges } from '../../utils/config'
import { fetchNodeReleases } from '../../utils/node'
import { parseVersionReference, selectVersionTarget } from '../../utils/versionReference'
import { getMaxSatisfying, getPrefixedVersion } from '../../utils/versions'
import { getCachedData } from '../cache'
import { getDiff, mergeMode } from '../shared'

function getNodeReleaseData(requestTimeout?: number): Promise<PackageData> {
  return getCachedData('node', () => fetchNodeReleases(requestTimeout).catch((error: any) => ({
    tags: {},
    versions: [],
    error: error?.statusCode?.toString() || error?.message || error,
  })))
}

/** `stable` keeps us on the current major, like `minor`. */
function nodeMode(mode: RangeMode): RangeMode {
  return mode === 'stable' ? 'minor' : mode
}

/** Node references coerce cleanly to semver (`22` -> `22.0.0`, `>=20` -> `20.0.0`). */
export function getNodeDiff(current: string, target: string): DiffType {
  return getDiff(coerce(current) ?? current, coerce(target) ?? target)
}

async function resolveNodeVersion(
  raw: RawDep,
  options: CheckOptions,
  filter: DependencyFilter = () => true,
): Promise<ResolvedDepChange> {
  const dep = { ...raw, provenanceDowngraded: false } as ResolvedDepChange
  const mode = mergeMode(raw.name, options, options.mode ?? 'default') as RangeMode | 'ignore'
  const exclude = getExcludeVersionRanges(raw.name, options)

  const noUpdate = (): ResolvedDepChange => {
    dep.diff = null
    dep.targetVersion = raw.currentVersion
    dep.update = false
    return dep
  }

  if (!raw.update || mode === 'ignore' || exclude === true || !await Promise.resolve(filter(raw)))
    return noUpdate()

  const pkgData = await getNodeReleaseData(options.requestTimeout)
  dep.pkgData = pkgData
  if (pkgData.error) {
    dep.diff = 'error'
    dep.update = false
    dep.resolveError = pkgData.error
    return dep
  }

  // Drop excluded and (optionally) too-recent releases before selecting.
  const maturityExclude = getMaturityPeriodExcludeRanges(raw.name, options)
  const cutoff = (options.maturityPeriod ?? 0) > 0 ? Date.now() - options.maturityPeriod! * 864e5 : 0
  const versions = pkgData.versions.filter((v) => {
    const semver = v.replace(/^v/, '')
    if (exclude.length && isVersionInExcludedRanges(semver, exclude))
      return false
    if (cutoff && maturityExclude !== true && !(maturityExclude.length && isVersionInExcludedRanges(semver, maturityExclude)))
      return !(pkgData.time?.[v] && new Date(pkgData.time[v]).getTime() > cutoff)
    return true
  })

  // A bare reference (`.node-version` / `.nvmrc`, or a plain `devEngines`
  // version) preserves its `v` prefix and granularity; a semver range (e.g.
  // `devEngines.runtime` `">=20"`) is resolved and rewritten like an npm range.
  const bare = parseVersionReference(raw.currentVersion)
  let resolved: string | undefined
  let targetVersion: string | undefined

  if (bare) {
    const picked = selectVersionTarget(raw.currentVersion, versions, nodeMode(mode))
    const latest = selectVersionTarget(raw.currentVersion, versions, 'newest')
    if (latest && latest.target !== picked?.target)
      dep.latestVersionAvailable = latest.target
    resolved = picked?.resolvedVersion
    targetVersion = picked?.target
  }
  else {
    try {
      resolved = getMaxSatisfying(versions, raw.currentVersion, mode, pkgData.tags)
    }
    catch (e: any) {
      dep.diff = 'error'
      dep.update = false
      dep.resolveError = e?.message || e
      return dep
    }
    targetVersion = resolved && (getPrefixedVersion(raw.currentVersion, resolved.replace(/^v/, '')) ?? undefined)
  }

  if (!targetVersion || targetVersion === raw.currentVersion)
    return noUpdate()

  dep.targetVersion = targetVersion
  dep.targetVersionTime = resolved ? pkgData.time?.[resolved] : undefined
  dep.currentVersionTime = pkgData.time?.[`v${coerce(raw.currentVersion)}`]
  dep.diff = getNodeDiff(raw.currentVersion, targetVersion)
  dep.update = dep.diff !== null && dep.diff !== 'error'
  return dep
}

export const nodeRegistry = {
  name: 'node' as const,
  resolve: resolveNodeVersion,
  getDiff: getNodeDiff,
}
