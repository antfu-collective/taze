import type { CheckOptions, DependencyFilter, RangeMode, RawDep, ResolvedDepChange } from '../../types'
import { findMinimumForRange } from 'verkit'
import {
  getLatestVersionAvailable,
  getPackageData,
  getVersionOfRange,
  updateTargetVersion,
} from '../npm/registry'
import { getDiff, mergeMode } from '../shared'

const JSR_PROTOCOL = 'jsr:'

/**
 * Resolve a JSR dependency (declared as `"@scope/name": "jsr:<range>"`).
 *
 * JSR packages are plain semver, so version selection reuses the shared npm
 * helpers; only metadata fetching (jsr.io `meta.json`) and the `jsr:` protocol
 * bookkeeping are specific to this ecosystem.
 */
async function resolveJsrDependency(
  raw: RawDep,
  options: CheckOptions,
  filter: DependencyFilter = () => true,
): Promise<ResolvedDepChange> {
  const dep = { ...raw } as ResolvedDepChange
  dep.provenanceDowngraded = false

  const mergedMode = mergeMode(dep.name, options)

  const noUpdate = (): ResolvedDepChange => {
    dep.diff = null
    dep.targetVersion = raw.currentVersion
    dep.update = false
    return dep
  }

  if (!raw.update || mergedMode === 'ignore' || !await Promise.resolve(filter(raw)))
    return noUpdate()

  // The `jsr:` protocol carries only a version; the package name is the key.
  const version = raw.currentVersion.startsWith(JSR_PROTOCOL)
    ? raw.currentVersion.slice(JSR_PROTOCOL.length)
    : raw.currentVersion
  dep.protocol = 'jsr'
  dep.currentVersion = version

  if (!version)
    return noUpdate()

  const pkgData = await getPackageData(dep.name, 'jsr', options.cwd, options.requestTimeout, options.retry, options.fastNpmMetaApiEndpoint)
  dep.pkgData = pkgData

  if (pkgData.error) {
    dep.diff = 'error'
    dep.update = false
    dep.resolveError = pkgData.error
    return dep
  }

  let target: string | undefined
  try {
    const versionLocked = /^\d/.test(dep.currentVersion)
    // Bare `--include-locked` historically checks exact versions within the
    // minor range; explicit/per-package modes keep their selected range.
    const targetMode = options.includeLocked && versionLocked && mergedMode === 'default'
      ? 'minor'
      : mergedMode

    target = getVersionOfRange(dep, targetMode as RangeMode, options)
  }
  catch (e: any) {
    dep.diff = 'error'
    dep.update = false
    dep.resolveError = e?.message || e
    return dep
  }

  if (!target)
    return noUpdate()

  updateTargetVersion(dep, target, undefined, options.includeLocked)

  if (dep.targetVersion === dep.currentVersion) {
    dep.diff = null
    dep.update = false
  }

  try {
    const targetVersion = findMinimumForRange(target || dep.targetVersion)
    if (targetVersion)
      dep.latestVersionAvailable = getLatestVersionAvailable(dep, targetVersion, options)
  }
  catch {}

  return dep
}

export const jsrRegistry = {
  name: 'jsr' as const,
  resolve: resolveJsrDependency,
  getDiff,
}
