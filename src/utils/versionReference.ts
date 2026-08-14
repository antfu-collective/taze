import type { RangeMode } from '../types'

/**
 * Parse and select numeric version references such as those in `.node-version`
 * / `.nvmrc` files: an optional `v` prefix and one to three numeric segments
 * (`22`, `22.14`, `v22.14.0`). Aliases (`lts/*`), ranges and prereleases don't
 * match.
 */

const VERSION_REFERENCE_RE = /^(v?)(\d+)(?:\.(\d+))?(?:\.(\d+))?([-+].*)?$/

export interface ParsedVersionReference {
  raw: string
  prefix: '' | 'v'
  major: number
  minor: number
  patch: number
  /** number of numeric segments present (1 for `22`, 3 for `22.14.0`) */
  segments: number
  prerelease: boolean
}

export function parseVersionReference(value: string): ParsedVersionReference | null {
  const match = VERSION_REFERENCE_RE.exec(value)
  if (!match)
    return null

  return {
    raw: value,
    prefix: match[1] as '' | 'v',
    major: Number(match[2]),
    minor: Number(match[3] ?? 0),
    patch: Number(match[4] ?? 0),
    segments: match[4] != null ? 3 : match[3] != null ? 2 : 1,
    prerelease: match[5]?.startsWith('-') ?? false,
  }
}

export function compareVersionReferences(a: ParsedVersionReference, b: ParsedVersionReference): number {
  return (a.major - b.major) || (a.minor - b.minor) || (a.patch - b.patch)
    // stable releases sort after their prereleases
    || (a.prerelease === b.prerelease ? a.raw.localeCompare(b.raw) : a.prerelease ? -1 : 1)
}

/**
 * Render `version` using the prefix and numeric granularity of `template`, so
 * `22` -> `24` stays major-only and `v22.14.0` -> `v24.1.0` stays full.
 */
export function formatVersionReference(version: ParsedVersionReference, template: ParsedVersionReference): string {
  const numeric = [version.major, version.minor, version.patch].slice(0, template.segments).join('.')
  return `${template.prefix}${numeric}`
}

/**
 * Pick the update target from `versions` (already filtered by the caller),
 * honoring the range mode and keeping the current reference's granularity.
 */
export function selectVersionTarget(currentValue: string, versions: string[], mode: RangeMode) {
  const current = parseVersionReference(currentValue)
  if (!current)
    return

  const allowPrerelease = mode === 'newest' || mode === 'next' || current.prerelease
  const stableCurrent = { ...current, prerelease: false }
  const candidates = versions
    .map(parseVersionReference)
    .filter((v): v is ParsedVersionReference => {
      if (!v || (!allowPrerelease && v.prerelease) || compareVersionReferences(v, stableCurrent) <= 0)
        return false
      if (mode === 'patch')
        return v.major === current.major && v.minor === current.minor
      if (mode === 'minor' || mode === 'default' || mode === 'stable')
        return v.major === current.major
      return true
    })
    .sort(compareVersionReferences)

  const best = candidates.at(-1)
  return best && { target: formatVersionReference(best, current), resolvedVersion: best.raw }
}
