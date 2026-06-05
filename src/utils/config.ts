import type { CheckOptions } from '../types'
import { toArray } from '@antfu/utils'
import { satisfies } from 'semver-es'
import { filterToRegex } from './dependenciesFilter'

export function getPackageMode(pkgName: string, options: CheckOptions) {
  if (!options.packageMode)
    return undefined

  for (const name of Object.keys(options.packageMode)) {
    const regex = filterToRegex(name)
    if (regex.test(pkgName))
      return options.packageMode[name]
  }
  return undefined
}

export function getMaturityPeriodExcludeRanges(pkgName: string, options: CheckOptions): true | string[] {
  const ranges: string[] = []

  for (const selector of toArray(options.maturityPeriodExclude).flatMap(item => item.split(','))) {
    const trimmed = selector.trim()
    if (!trimmed)
      continue

    const versionSeparatorIndex = trimmed.startsWith('/') ? -1 : trimmed.lastIndexOf('@')
    const name = versionSeparatorIndex > 0 ? trimmed.slice(0, versionSeparatorIndex) : trimmed

    if (!filterToRegex(name).test(pkgName))
      continue

    if (versionSeparatorIndex <= 0)
      return true

    const versionRanges = trimmed
      .slice(versionSeparatorIndex + 1)
      .split('||')
      .map(range => range.trim())
      .filter(Boolean)

    ranges.push(...versionRanges)
  }

  return ranges
}

export function isVersionMaturityPeriodExcluded(version: string, ranges: string[]) {
  for (const range of ranges) {
    if (satisfies(version, range, { includePrerelease: true }))
      return true
  }

  return false
}
