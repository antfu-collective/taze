import { existsSync, promises as fs, lstatSync } from 'node:fs'
import { resolve } from 'node:path'
import os from 'node:os'
import pacote from 'pacote'
import semver from 'semver'
import _debug from 'debug'
import { getNpmConfig } from '../utils/npm'
import type { CheckOptions, DependencyFilter, DependencyResolvedCallback, PackageData, PackageMeta, RangeMode, RawDep, ResolvedDepChange } from '../types'
import { diffSorter } from '../filters/diff-sorter'
import { getMaxSatisfying, getPrefixedVersion } from '../utils/versions'
import { getPackageMode } from '../utils/config'

const debug = {
  cache: _debug('taze:cache'),
  resolve: _debug('taze:resolve'),
}

let cache: Record<string, { cacheTime: number; data: PackageData }> = {}
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
    const data = await pacote.packument(name, { ...npmConfig, fullMetadata: true })

    if (data) {
      const result = {
        tags: data['dist-tags'],
        versions: Object.keys(data.versions || {}),
        time: data.time,
        // raw: data,
      }

      cache[name] = { data: result, cacheTime: now() }

      cacheChanged = true

      return result
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

export function updateTargetVersion(dep: ResolvedDepChange, version: string, forgiving = true) {
  dep.targetVersion = getPrefixedVersion(dep.currentVersion, version) || dep.currentVersion
  dep.targetVersionTime = dep.pkgData.time?.[version]

  try {
    const current = semver.minVersion(dep.currentVersion)!
    const target = semver.minVersion(dep.targetVersion)!

    dep.currentVersionTime = dep.pkgData.time?.[current.toString()]
    dep.diff = semver.diff(current, target)
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

  const pkgData = await getPackageData(dep.name)
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
    updateTargetVersion(dep, target)
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
