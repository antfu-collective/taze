import { existsSync, promises as fs, lstatSync } from 'node:fs'
import { resolve } from 'node:path'
import os from 'node:os'
import semver from 'semver'
import _debug from 'debug'
import { getNpmConfig } from '../utils/npm'
import type { CheckOptions, DependencyFilter, DependencyResolvedCallback, DiffType, PackageData, PackageMeta, RangeMode, RawDep, ResolvedDepChange } from '../types'
import { diffSorter } from '../filters/diff-sorter'
import { getMaxSatisfying, getPrefixedVersion } from '../utils/versions'
import { getPackageMode } from '../utils/config'
import { parsePnpmPackagePath, parseYarnPackagePath } from '../utils/package'
import { fetchPackage } from '../utils/packument'

const debug = {
  cache: _debug('taze:cache'),
  resolve: _debug('taze:resolve'),
}

let cache: Record<string, { cacheTime: number, data: PackageData }> = {}
let cacheChanged = false

const cacheDir = resolve(os.tmpdir(), 'taze')
const cachePath = resolve(cacheDir, 'cache.json')
const cacheTTL = 30 * 60_000 // 30min

function now() {
  return +new Date()
}

function ttl(n: number) {
  return now() - n
}

export async function loadCache() {
  if (existsSync(cachePath) && ttl(lstatSync(cachePath).mtimeMs) < cacheTTL) {
    debug.cache(`cache loaded from ${cachePath}`)
    cache = JSON.parse(await fs.readFile(cachePath, 'utf-8'))
  }
  else {
    debug.cache('no cache found')
  }
}

export async function dumpCache() {
  if (!cacheChanged)
    return
  try {
    await fs.mkdir(cacheDir, { recursive: true })
    await fs.writeFile(cachePath, JSON.stringify(cache), 'utf-8')
    debug.cache(`cache saved to ${cachePath}`)
  }
  catch (err) {
    console.warn('Failed to save cache')
    console.warn(err)
  }
}

export async function getPackageData(name: string): Promise<PackageData> {
  let error: any

  if (cache[name]) {
    if (ttl(cache[name].cacheTime) < cacheTTL) {
      debug.cache(`cache hit for ${name}`)
      return cache[name].data
    }
    else { delete cache[name] }
  }

  try {
    debug.resolve(`resolving ${name}`)
    const npmConfig = await getNpmConfig()
    const data = await fetchPackage(name, npmConfig)

    if (data) {
      cache[name] = { data, cacheTime: now() }

      cacheChanged = true

      return data
    }
  }
  catch (e) {
    error = e
  }

  return {
    tags: {},
    versions: [],
    error: error?.statusCode?.toString() || error,
  }
}

export function getVersionOfRange(dep: ResolvedDepChange, range: RangeMode) {
  const { versions, tags } = dep.pkgData
  return getMaxSatisfying(versions, dep.currentVersion, range, tags)
}

export function updateTargetVersion(
  dep: ResolvedDepChange,
  version: string,
  forgiving = true,
  includeLocked = false,
) {
  const versionLocked = /^\d+/.test(dep.currentVersion)
  if (versionLocked && !includeLocked) {
    dep.targetVersion = dep.currentVersion
    dep.targetVersionTime = dep.currentVersionTime
    dep.diff = null
    dep.update = false
    return
  }

  dep.targetVersion = getPrefixedVersion(dep.currentVersion, version) || dep.currentVersion
  dep.targetVersionTime = dep.pkgData.time?.[version]

  if (versionLocked && semver.eq(dep.currentVersion, dep.targetVersion)) {
    // for example: `taze`/`taze -P` is default mode (and it matched from patch to minor)
    // - but this mode will always ignore the locked pkgs
    // - so we need to reset the target
    const { versions, time = {}, tags } = dep.pkgData
    const targetVersion = getMaxSatisfying(versions, dep.currentVersion, 'minor', tags)
    if (targetVersion) {
      dep.targetVersion = targetVersion
      dep.targetVersionTime = time[dep.targetVersion]
    }
  }

  try {
    const current = semver.minVersion(dep.currentVersion)!
    const target = semver.minVersion(dep.targetVersion)!

    dep.currentVersionTime = dep.pkgData.time?.[current.toString()]
    dep.diff = getDiff(current, target)
    dep.update = dep.diff !== null && semver.lt(current, target)
  }
  catch (e) {
    if (!forgiving)
      throw e
    dep.targetVersion = dep.currentVersion
    dep.diff = 'error'
    dep.update = false
  }
}

export function getDiff(current: semver.SemVer, target: semver.SemVer): DiffType {
  if (semver.eq(current, target))
    return null

  const tilde = semver.satisfies(target, `~${current}`, { includePrerelease: true })
  const caret = semver.satisfies(target, `^${current}`, { includePrerelease: true })
  const gte = semver.satisfies(target, `>=${current}`, { includePrerelease: true })

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

export async function resolveDependency(
  raw: RawDep,
  options: CheckOptions,
  filter: DependencyFilter = () => true,
) {
  const dep = { ...raw } as ResolvedDepChange

  const configMode = getPackageMode(dep.name, options)
  const optionMode = options.mode
  const mergeMode = configMode
    ? (configMode === optionMode)
        ? optionMode
        : optionMode === 'default' ? configMode : 'ignore'
    : optionMode
  if (isLocalPackage(raw.currentVersion) || !raw.update || !await Promise.resolve(filter(raw)) || mergeMode === 'ignore') {
    return {
      ...raw,
      diff: null,
      targetVersion: raw.currentVersion,
      update: false,
    } as ResolvedDepChange
  }
  if (isAliasedPackage(raw.currentVersion)) {
    const { name, version } = parseAliasedPackage(raw.currentVersion)
    dep.name = name
    dep.currentVersion = version
    dep.aliasName = raw.name
    if (!version) {
      dep.diff = null
      dep.targetVersion = version
      dep.update = false
      return dep
    }
  }

  let resolvedName = dep.name

  // manage Yarn resolutions (e.g. "foo@1/bar")
  if (dep.source === 'resolutions') {
    const packages = parseYarnPackagePath(dep.name)
    resolvedName = packages.pop() ?? dep.name
  }
  // manage pnpm overrides (e.g. "foo@1>bar")
  else if (dep.source === 'pnpm.overrides') {
    const packages = parsePnpmPackagePath(dep.name)
    resolvedName = packages.pop() ?? dep.name
  }

  const pkgData = await getPackageData(resolvedName)
  const { tags, error } = pkgData
  dep.pkgData = pkgData
  let err: Error | string | null = null
  let target: string | undefined

  if (error == null) {
    try {
      target = getVersionOfRange(dep, mergeMode as RangeMode)
    }
    catch (e: any) {
      err = e.message || e
    }
  }
  else {
    err = error
  }

  if (target)
    updateTargetVersion(dep, target, undefined, options.includeLocked)
  else
    dep.targetVersion = dep.currentVersion

  if (dep.targetVersion === dep.currentVersion) {
    dep.diff = null
    dep.update = false
  }

  try {
    const targetVersion = semver.minVersion(target || dep.targetVersion)
    if (tags.latest && targetVersion && semver.gt(tags.latest, targetVersion))
      dep.latestVersionAvailable = tags.latest
  }
  catch {}

  if (err) {
    dep.diff = 'error'
    dep.update = false
    dep.resolveError = err
    return dep
  }

  return dep
}

export async function resolveDependencies(
  deps: RawDep[],
  options: CheckOptions,
  filter: DependencyFilter = () => true,
  progressCallback: (name: string, counter: number, total: number) => void = () => {},
) {
  const total = deps.length
  let counter = 0

  return Promise.all(
    deps
      .map(async (raw) => {
        const dep = await resolveDependency(raw, options, filter)
        counter += 1
        progressCallback(raw.name, counter, total)
        return dep
      }),
  )
}

export async function resolvePackage(pkg: PackageMeta, options: CheckOptions, filter?: DependencyFilter, progress?: DependencyResolvedCallback) {
  const resolved = await resolveDependencies(pkg.deps, options, filter, (name, counter, total) => progress?.(pkg.name, name, counter, total))
  diffSorter(resolved)
  pkg.resolved = resolved
  return pkg
}

function isLocalPackage(currentVersion: string) {
  const localPackagePrefix = [
    'link:',
    'file:',
    'workspace:',
  ]
  return localPackagePrefix.some(prefix => currentVersion.startsWith(prefix))
}

function isAliasedPackage(currentVersion: string) {
  return currentVersion.startsWith('npm:')
}

function parseAliasedPackage(currentVersion: string) {
  const m = currentVersion.match(/^npm:(@?[^@]+)(?:@(.+))?$/)
  if (!m)
    return { name: '', version: '' }

  return { name: m[1], version: m[2] ?? '' }
}
