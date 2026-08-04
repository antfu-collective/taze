import type { CheckOptions } from '../types'
import { toArray } from '@antfu/utils'
import { satisfies } from 'verkit'
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

// Parses `name`/`name@range` selectors (e.g. `webpack`, `typescript@7`, `typescript@^7||^8`)
// and resolves, for a given package name, either:
// - `true` — the package name itself matched a selector with no version part, i.e. fully excluded
// - `string[]` — the semver ranges (possibly empty) that should be treated as excluded versions
function resolveNameVersionSelectors(pkgName: string, selectors: string[]): true | string[] {
  const ranges: string[] = []

  for (const selector of selectors) {
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

export function getMaturityPeriodExcludeRanges(pkgName: string, options: CheckOptions): true | string[] {
  return resolveNameVersionSelectors(pkgName, toArray(options.maturityPeriodExclude).flatMap(item => item.split(',')))
}

// Supports `name@range` selectors in `--exclude`/`--include` (e.g. `typescript@7`) so a specific
// major/minor/range of a package can be excluded from the candidate versions without excluding
// the whole package from being checked/updated.
export function getExcludeVersionRanges(pkgName: string, options: CheckOptions): true | string[] {
  return resolveNameVersionSelectors(pkgName, toArray(options.exclude).flatMap(item => item.split(',')))
}

export function isVersionInExcludedRanges(version: string, ranges: string[]) {
  for (const range of ranges) {
    if (satisfies(version, range, { includePrerelease: true }))
      return true
  }

  return false
}
