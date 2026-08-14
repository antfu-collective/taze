import type { CheckOptions, DependencyFilter, DiffType, PackageData, RangeMode, RawDep, ResolvedDepChange } from '../../types'
import { coerce, isValid } from 'verkit'
import { getExcludeVersionRanges, getMaturityPeriodExcludeRanges, isVersionInExcludedRanges } from '../../utils/config'
import { fetchActionTags, fetchCommitDate, selectTarget } from '../../utils/github'
import { cache, cacheTTL, debug, inflightRequests, markCacheChanged, now, ttl } from '../cache'
import { getDiff as getSemverDiff, mergeMode } from '../shared'

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
      markCacheChanged()
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

/**
 * Diff between two GitHub Action references. Tags may be partial (e.g. `v4`),
 * which the semver diff cannot parse directly, so coerce them to full semver
 * first before delegating to the shared diff.
 */
export function getGitHubActionDiff(current: string, target: string): DiffType {
  if (!isValid(current))
    current = coerce(current) ?? current
  if (!isValid(target))
    target = coerce(target) ?? target

  return getSemverDiff(current, target)
}

export async function resolveGitHubAction(
  raw: RawDep,
  options: CheckOptions,
  filter: DependencyFilter = () => true,
): Promise<ResolvedDepChange> {
  const dep = { ...raw } as ResolvedDepChange
  dep.provenanceDowngraded = false

  const info = raw.githubAction
  const mode = mergeMode(raw.name, options, options.mode ?? 'default')

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
  dep.diff = getGitHubActionDiff(raw.currentVersion, target.tag)
  dep.update = dep.diff !== null && dep.diff !== 'error'
  dep.githubAction = {
    ...info,
    targetSha: pkgData.shaMap?.[target.tag] ?? pkgData.shaMap?.[target.resolvedTag],
  }

  return dep
}

export const githubActionsRegistry = {
  name: 'github-actions' as const,
  resolve: resolveGitHubAction,
  getDiff: getGitHubActionDiff,
}
