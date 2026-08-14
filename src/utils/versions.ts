import type { RangeMode } from '../types'
import { findMinimumForRange, isGreater, isLessOrEqual, isPrerelease, normalizeRange, satisfies } from 'verkit'

export function getVersionRangePrefix(v: string) {
  const leadings = ['>=', '<=', '>', '<', '~', '^']
  const ver = v.trim()

  if (ver === '*' || ver === '')
    return '*'
  if (ver[0] === '~' || ver[0] === '^')
    return ver[0]
  for (const leading of leadings) {
    if (ver.startsWith(leading))
      return leading
  }
  if (ver.includes('x')) {
    const parts = ver.split('.')
    if (parts[0] === 'x')
      return '*'
    if (parts[1] === 'x')
      return '^'
    if (parts[2] === 'x')
      return '~'
  }
  if (+ver[0] < 10)
    return ''
  return null
}

export function changeVersionRange(version: string, mode: Exclude<RangeMode, 'latest' | 'newest' | 'stable' | 'next'>) {
  if (!normalizeRange(version))
    return null

  if (mode === 'default')
    return version

  const min = findMinimumForRange(version)
  if (!min)
    return null

  return {
    major: '>=',
    minor: '^',
    patch: '~',
  }[mode] + min
}

function applyVersionRangePrefix(version: string | null, prefix: string | null) {
  if (version == null || prefix == null)
    return null

  if (prefix === '*')
    return '*'

  return prefix + version
}

export function getPrefixedVersion(current: string, target: string) {
  const prefix = getVersionRangePrefix(current)
  return applyVersionRangePrefix(
    target,
    prefix,
  )
}

/**
 * Extract the prerelease channel from a version, e.g. `beta` from
 * `1.0.0-beta.20` or `1.0.0-beta.9-e89174b`, or `rc` from `1.0.0-rc.1`.
 * Returns undefined when there is no alphabetic prerelease identifier.
 */
function getPrereleaseChannel(version: string): string | undefined {
  const dashIndex = version.indexOf('-')
  if (dashIndex === -1)
    return undefined

  // drop build metadata, then take the first dot-separated prerelease identifier
  const first = version.slice(dashIndex + 1).split('+')[0].split('.')[0]
  const match = first.match(/^[a-z]+/i)
  return match ? match[0] : undefined
}

export function getMaxSatisfying(versions: string[], current: string, mode: RangeMode, tags: Record<string, string>): string | undefined {
  let version: string | null = null

  if (mode === 'latest') {
    const latest = tags.latest
    if (versions.includes(latest)) {
      version = latest
    }
    else {
      const currentMin = findMinimumForRange(current)
      const currentIsPrerelease = !!currentMin && isPrerelease(currentMin)
      const latestIsPrerelease = !!latest && isPrerelease(latest)
      // only consider prerelease candidates if either the currently installed
      // version or the registry's `latest` tag is itself on a prerelease track
      const allowPrerelease = currentIsPrerelease || latestIsPrerelease

      const candidates = versions.filter(ver =>
        (allowPrerelease || !isPrerelease(ver)) && (!latest || isLessOrEqual(ver, latest)),
      )

      version = candidates.at(-1) ?? null
    }
  }
  else if (mode === 'newest') {
    version = versions.at(-1)!
  }
  else if (mode === 'next') {
    version = tags.next && versions.includes(tags.next) ? tags.next : versions.at(-1) ?? null
  }
  else if (mode === 'stable') {
    const range = changeVersionRange(current, 'default')
    if (!range)
      return

    versions
      .filter(ver => !ver.includes('-'))
      .forEach((ver) => {
        if (satisfies(ver, range)) {
          if (!version || isGreater(ver, version))
            version = ver
        }
      })
  }
  else if (mode === 'default' && (current === '*' || current.trim() === '')) {
    return
  }
  else {
    const range = changeVersionRange(current, mode)
    if (!range)
      throw new Error('invalid_range')

    let maxVersion: string | null = tags.latest
    if (!satisfies(maxVersion, range))
      maxVersion = null

    // When the range targets a prerelease channel but the `latest` dist-tag
    // doesn't apply (e.g. `latest` still points at a stable release), fall back
    // to that channel's own dist-tag as the cap. Without a cap, semver ranks a
    // build-hash prerelease like `1.0.0-beta.9-e89174b` above `1.0.0-beta.20`
    // (an alphanumeric identifier outranks a numeric one), so a stray snapshot
    // publish would win over the real newest beta. See #256.
    if (!maxVersion) {
      const min = findMinimumForRange(current)
      const channel = min && isPrerelease(min) ? getPrereleaseChannel(min) : undefined
      const channelTag = channel ? tags[channel] : undefined
      if (channelTag && satisfies(channelTag, range))
        maxVersion = channelTag
    }

    versions.forEach((ver) => {
      if (satisfies(ver, range)) {
        if (!maxVersion || isLessOrEqual(ver, maxVersion)) {
          if (!version || isGreater(ver, version))
            version = ver
        }
      }
    })
  }

  if (!version)
    return

  return version
}

export function filterDeprecatedVersions(versions: string[], deprecated: Record<string, string | boolean>): string[] {
  return versions.filter(version => !deprecated[version])
}

export function filterVersionsByMaturityPeriod(
  versions: string[],
  time: Record<string, string> | undefined,
  maturityPeriodDays: number,
): string[] {
  if (!time || maturityPeriodDays <= 0) {
    return versions
  }

  const now = new Date()
  const cutoffDate = new Date(now.getTime() - (maturityPeriodDays * 24 * 60 * 60 * 1000))

  return versions.filter((version) => {
    const versionTime = time[version]
    if (!versionTime) {
      return true
    }

    const releaseDate = new Date(versionTime)
    const isMature = releaseDate < cutoffDate

    return isMature
  })
}
