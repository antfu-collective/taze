import fs from 'fs'
import { join } from 'path'
import type { Packument } from 'pacote'
import pacote from 'pacote'
import semver from 'semver'
import _debug from 'debug'
import { npmConfig } from '../utils/npm'
import type { DependencyFilter, DependencyResolvedCallback, PackageMeta, RangeMode, RawDependency, ResolvedDependencies } from '../types'
import { diffSorter } from '../filters/diff-sorter'
import { getMaxSatisfying } from '../utils/versions'

const debug = {
  cache: _debug('taze:cache'),
  resolve: _debug('taze:resolve'),
}

interface PackageData {
  tags: Record<string, string>
  versions: string[]
  time?: Record<string, string>
  raw?: Packument
  error?: Error | string
}

let cache: Record<string, { cacheTime: number; data: PackageData }> = {}
let cacheChanged = false

const cachePath = join(__dirname, 'cache.json')
const cacheTTL = 5 * 60_000 // 5min

function now() {
  return +new Date()
}

function ttl(n: number) {
  return now() - n
}

export function loadCache() {
  if (fs.existsSync(cachePath) && ttl(fs.lstatSync(cachePath).mtimeMs) < cacheTTL) {
    debug.cache(`cache loaded from ${cachePath}`)
    cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'))
  }
  else {
    debug.cache('no cache found')
  }
}

export function dumpCache() {
  if (!cacheChanged)
    return
  fs.writeFileSync(cachePath, JSON.stringify(cache), 'utf-8')
  debug.cache(`cache saved to ${cachePath}`)
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

export async function resolveDependency(
  raw: RawDependency,
  mode: RangeMode,
  filter: DependencyFilter = () => true,
) {
  if (!raw.update || !await Promise.resolve(filter(raw))) {
    return {
      ...raw,
      diff: null,
      targetVersion: raw.currentVersion,
      update: false,
    } as ResolvedDependencies
  }

  const dep = { ...raw } as ResolvedDependencies
  const { versions, tags, error, time = {} } = await getPackageData(dep.name)
  let err: Error | string | null = null
  let max: { version: string; prefix: string | null; prefixed: string | null } | null = null

  if (error == null) {
    try {
      max = getMaxSatisfying(versions, dep.currentVersion, mode, tags)
    }
    catch (e: any) {
      err = e.message || e
    }
  }
  else {
    err = error
  }

  if (err == null && max?.prefixed) {
    dep.targetVersion = max.prefixed
    dep.targetVersionTime = time[max.version]

    const current = semver.minVersion(dep.currentVersion)!
    const latest = semver.minVersion(dep.targetVersion)!

    dep.currentVersionTime = time[current.toString()]
    dep.diff = semver.diff(current, latest)
    dep.update = dep.diff !== null && semver.lt(current, latest)

    if (tags.latest && semver.gt(tags.latest, max.version))
      dep.latestVersionAvailable = tags.latest
  }
  else {
    dep.targetVersion = dep.currentVersion
    dep.diff = 'error'
    dep.update = false
    dep.resolveError = err
  }
  return dep
}

export async function resolveDependencies(
  deps: RawDependency[],
  mode: RangeMode,
  filter: DependencyFilter = () => true,
  progressCallback: (name: string, counter: number, total: number) => void = () => {},
) {
  const total = deps.length
  let counter = 0

  return Promise.all(
    deps
      .map(async(raw) => {
        const dep = await resolveDependency(raw, mode, filter)
        counter += 1
        progressCallback(raw.name, counter, total)
        return dep
      }),
  )
}

export async function resolvePackage(pkg: PackageMeta, mode: RangeMode, filter?: DependencyFilter, progress?: DependencyResolvedCallback) {
  const resolved = await resolveDependencies(pkg.deps, mode, filter, (name, counter, total) => progress?.(pkg.name, name, counter, total))
  diffSorter(resolved)
  pkg.resolved = resolved
  return pkg
}
