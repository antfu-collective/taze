import type { RangeMode } from '../types'

/**
 * Parse and select numeric version references such as those found in
 * `.node-version` / `.nvmrc` files: an optional `v` prefix followed by one to
 * three numeric segments (`22`, `22.14`, `v22.14.0`). Aliases (`lts/*`,
 * `node`), ranges and prereleases are intentionally not matched.
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

export interface SelectVersionTargetOptions {
  /** require a leading `v` for both the current ref and every candidate */
  requireV?: boolean
  /** reject specific candidates (e.g. excluded ranges) */
  reject?: (version: ParsedVersionReference) => boolean
}

export interface SelectedVersionTarget {
  /** the reference to write, formatted to match the current granularity */
  target: string
  /** the underlying resolved version (always fully specified) */
  resolvedVersion: string
}

export function parseVersionReference(value: string, requireV = false): ParsedVersionReference | null {
  const match = VERSION_REFERENCE_RE.exec(value)
  if (!match || (requireV && match[1] !== 'v'))
    return null

  const segments = match[4] != null ? 3 : match[3] != null ? 2 : 1
  return {
    raw: value,
    prefix: match[1] as '' | 'v',
    major: Number(match[2]),
    minor: Number(match[3] ?? 0),
    patch: Number(match[4] ?? 0),
    segments,
    prerelease: match[5]?.startsWith('-') ?? false,
  }
}

export function compareVersionReferences(a: ParsedVersionReference, b: ParsedVersionReference): number {
  if (a.major !== b.major)
    return a.major - b.major
  if (a.minor !== b.minor)
    return a.minor - b.minor
  if (a.patch !== b.patch)
    return a.patch - b.patch
  // stable releases sort after their prereleases
  if (a.prerelease !== b.prerelease)
    return a.prerelease ? -1 : 1
  return a.raw.localeCompare(b.raw)
}

/**
 * Render `version` using the prefix and numeric granularity of `template`, so
 * a major-only reference stays major-only (`22` -> `24`) and a full reference
 * stays full (`v22.14.0` -> `v24.1.0`).
 */
export function formatVersionReference(
  version: ParsedVersionReference,
  template: ParsedVersionReference,
): string {
  const numeric = template.segments === 1
    ? `${version.major}`
    : template.segments === 2
      ? `${version.major}.${version.minor}`
      : `${version.major}.${version.minor}.${version.patch}`

  return `${template.prefix}${numeric}`
}

/**
 * Pick the update target from `versions`, honoring the range mode and keeping
 * the granularity/prefix of the current reference.
 */
export function selectVersionTarget(
  currentValue: string,
  versions: string[],
  mode: RangeMode,
  options: SelectVersionTargetOptions = {},
): SelectedVersionTarget | undefined {
  const current = parseVersionReference(currentValue, options.requireV)
  if (!current)
    return

  const allowPrerelease = mode === 'newest' || mode === 'next' || current.prerelease
  const candidates = versions
    .map(version => parseVersionReference(version, options.requireV))
    .filter((version): version is ParsedVersionReference => !!version)
    .filter((version) => {
      if (!allowPrerelease && version.prerelease)
        return false
      if (options.reject?.(version))
        return false

      const stableCurrent = { ...current, prerelease: false }
      if (compareVersionReferences(version, stableCurrent) <= 0)
        return false

      switch (mode) {
        case 'patch':
          return version.major === current.major && version.minor === current.minor
        case 'minor':
        case 'default':
        case 'stable':
          return version.major === current.major
        default:
          return true
      }
    })

  if (!candidates.length)
    return

  candidates.sort(compareVersionReferences)
  const best = candidates.at(-1)!

  return {
    target: formatVersionReference(best, current),
    resolvedVersion: best.raw,
  }
}
