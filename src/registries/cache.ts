import type { PackageData } from '../types'
import { existsSync, promises as fs, lstatSync } from 'node:fs'
import os from 'node:os'
import { createDebug } from 'obug'
import { resolve } from 'pathe'

const debug = {
  cache: createDebug('taze:cache'),
  resolve: createDebug('taze:resolve'),
}

export { debug }

// eslint-disable-next-line import/no-mutable-exports
export let cache: Record<string, { cacheTime: number, data: PackageData }> = {}
let cacheChanged = false
export const inflightRequests = new Map<string, Promise<PackageData>>()

const cacheDir = resolve(os.tmpdir(), 'taze')
const cachePath = resolve(cacheDir, 'cache.json')
export const cacheTTL = 30 * 60_000 // 30min

export function now() {
  return Date.now()
}

export function ttl(n: number) {
  return now() - n
}

export function markCacheChanged() {
  cacheChanged = true
}

/**
 * Resolve `PackageData` for `cacheName`, sharing the on-disk cache, TTL and
 * in-flight de-duplication used across registries. Successful results (no
 * `error`) are cached; the fetcher is responsible for shaping errors.
 */
export async function getCachedData(cacheName: string, fetcher: () => Promise<PackageData>): Promise<PackageData> {
  if (cache[cacheName] && ttl(cache[cacheName].cacheTime) < cacheTTL) {
    debug.cache(`cache hit for ${cacheName}`)
    return cache[cacheName].data
  }

  const inflight = inflightRequests.get(cacheName)
  if (inflight) {
    debug.cache(`in-flight hit for ${cacheName}`)
    return inflight
  }

  const request = (async () => {
    debug.resolve(`resolving ${cacheName}`)
    const data = await fetcher()
    if (!data.error) {
      cache[cacheName] = { data, cacheTime: now() }
      markCacheChanged()
    }
    return data
  })()

  inflightRequests.set(cacheName, request)
  try {
    return await request
  }
  finally {
    inflightRequests.delete(cacheName)
  }
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
