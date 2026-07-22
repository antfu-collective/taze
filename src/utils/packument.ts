import type { PackageVersionsInfoWithMetadata } from 'get-npm-meta'
import type { JsrPackageMeta, PackageData, RetryOptions } from '../types'
import process from 'node:process'
import { getVersions } from 'get-npm-meta'
import { fetch as ofetch } from 'ofetch'
import { getRegistriesEnv } from './registries'

const DEFAULT_REQUEST_TIMEOUT = 5000
const DEFAULT_RETRIES = 4
const JSR_API_REGISTRY = 'https://jsr.io/'
const USER_AGENT = `taze@npm node/${process.version}`

// @types/pacote uses "import = require()" syntax which is not supported by unbuild
// So instead of using @types/pacote, we declare the type definition with only fields we need
export interface PackumentVersion {
  name: string
  deprecated?: string | boolean
  dist: {
    attestations: {
      provenance?: { predicateType: string }
    }
  }
}

export interface Packument {
  'name': string
  /**
   * An object where each key is a version, and each value is the manifest for
   * that version.
   */
  'versions': Record<string, PackumentVersion>
  /**
   * An object mapping dist-tags to version numbers. This is how `foo@latest`
   * gets turned into `foo@1.2.3`.
   */
  'dist-tags': { latest: string } & Record<string, string>
  /**
   * In the full packument, an object mapping version numbers to publication
   * times, for the `opts.before` functionality.
   */
  'time': Record<string, string> & {
    created: string
    modified: string
  }
}

const fetchWithUserAgent: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers)
  headers.set('user-agent', USER_AGENT)
  return ofetch(input, { ...init, headers })
}

function createTimeoutError(name: string) {
  return new Error(`Timeout requesting "${name}"`)
}

async function withRequestTimeout<T>(name: string, timeout: number, run: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController()
  const timeoutError = createTimeoutError(name)
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(timeoutError)
      controller.abort(timeoutError)
    }, timeout)
  })

  try {
    return await Promise.race([run(controller.signal), timeoutPromise])
  }
  finally {
    if (timeoutId)
      clearTimeout(timeoutId)

    controller.abort(timeoutError)
  }
}

export async function fetchPackage(spec: string, force: boolean = false, cwd?: string, requestTimeout: number = DEFAULT_REQUEST_TIMEOUT, retry: number | false | RetryOptions = DEFAULT_RETRIES): Promise<PackageData> {
  const registriesEnv = getRegistriesEnv(cwd)
  const env = Object.keys(registriesEnv).length > 0
    ? { ...process.env, ...registriesEnv }
    : undefined

  const data = await withRequestTimeout(spec, requestTimeout, signal => getVersions(spec, {
    cwd,
    force,
    fetch: (input, init) => fetchWithUserAgent(input, { ...init, signal }),
    metadata: true,
    throw: false,
    env,
    // an object without an explicit count should still retry 4 times by default
    retry: typeof retry === 'object' ? { retries: DEFAULT_RETRIES, ...retry } : retry,
  })) as PackageVersionsInfoWithMetadata

  if ('error' in data)
    throw new Error(`Failed to fetch package "${spec}": ${data.error}`)

  return toPackageData(data)
}

export async function fetchJsrPackageMeta(name: string, requestTimeout: number = DEFAULT_REQUEST_TIMEOUT): Promise<PackageData> {
  const meta = await withRequestTimeout(name, requestTimeout, signal => fetchWithUserAgent(new URL(`${name}/meta.json`, JSR_API_REGISTRY), {
    signal,
    headers: {
      accept: 'application/json',
    },
  }).then(r => r.json())) as JsrPackageMeta

  return {
    versions: Object.keys(meta.versions),
    tags: { latest: meta.latest },
  }
}

function toPackageData(data: PackageVersionsInfoWithMetadata): PackageData {
  const versions = Object.keys(data.versionsMeta)
  const deprecated = Object.fromEntries(
    Object.entries(data.versionsMeta)
      .filter(([, meta]) => meta.deprecated)
      .map(([version, meta]) => [version, meta.deprecated!]),
  )
  const nodeSemver = Object.fromEntries(
    Object.entries(data.versionsMeta)
      .map(([version, meta]) => [version, meta.engines?.node])
      .filter(([, node]) => node),
  )
  const provenance = Object.fromEntries(
    Object.entries(data.versionsMeta)
      .map(([version, meta]) => [version, meta.provenance])
      .filter(([, value]) => value),
  )
  const integrity = Object.fromEntries(
    Object.entries(data.versionsMeta)
      .map(([version, meta]) => [version, meta.integrity])
      .filter(([, value]) => value),
  )

  return {
    tags: data.distTags,
    versions,
    time: {
      ...Object.fromEntries(
        Object.entries(data.versionsMeta)
          .filter(([, meta]) => meta.time)
          .map(([version, meta]) => [version, meta.time!]),
      ),
      created: data.timeCreated,
      modified: data.timeModified,
    },
    nodeSemver,
    provenance,
    deprecated: Object.keys(deprecated).length > 0 ? deprecated : undefined,
    integrity,
  }
}
