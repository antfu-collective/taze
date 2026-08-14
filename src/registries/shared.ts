import type { CheckOptions, DiffType, RangeMode } from '../types'
import { isEqual, satisfies } from 'verkit'
import { getPackageMode } from '../utils/config'

/**
 * Merge the per-package mode (from config) with the global `--mode` option,
 * shared by every registry.
 *
 * `optionMode` defaults to the raw `options.mode` (which may be `undefined`);
 * callers that need a concrete fallback pass it explicitly.
 */
export function mergeMode(
  name: string,
  options: CheckOptions,
  optionMode: RangeMode | undefined = options.mode,
): RangeMode | 'ignore' | undefined {
  const configMode = getPackageMode(name, options)
  return (configMode
    ? (configMode === optionMode
        ? optionMode
        : optionMode === 'default' ? configMode : 'ignore')
    : optionMode) as RangeMode | 'ignore' | undefined
}

/**
 * Compute the semver diff between two versions. This is the plain, ecosystem
 * agnostic implementation; registries that deal with non-semver refs (e.g.
 * GitHub Action tags) coerce their inputs before delegating here.
 */
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
