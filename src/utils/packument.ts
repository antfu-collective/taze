import type { PackageVersionsInfoWithMetadata } from 'get-npm-meta'
import type { JsrPackageMeta, PackageData } from '../types'
import process from 'node:process'
import { getVersions } from 'get-npm-meta'
import { fetch as ofetch } from 'ofetch'

const TIMEOUT = 5000
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

export async function fetchPackage(spec: string, force = false): Promise<PackageData> {
  const data = await Promise.race([
    getVersions(spec, {
      force,
      fetch: fetchWithUserAgent,
      metadata: true,
      throw: false,
    }),
    new Promise<Packument>(
      (_, reject) => setTimeout(() => reject(new Error(`Timeout requesting "${spec}"`)), TIMEOUT),
    ),
  ]) as PackageVersionsInfoWithMetadata

  if ('error' in data)
    throw new Error(`Failed to fetch package "${spec}": ${data.error}`)

  return toPackageData(data)
}

export async function fetchJsrPackageMeta(name: string): Promise<PackageData> {
  const meta = await Promise.race([
    fetchWithUserAgent(new URL(`${name}/meta.json`, JSR_API_REGISTRY), {
      headers: {
        accept: 'application/json',
      },
    }).then(r => r.json()),
    new Promise<JsrPackageMeta>(
      (_, reject) => setTimeout(() => reject(new Error(`Timeout requesting "${name}"`)), TIMEOUT),
    ),
  ]) as JsrPackageMeta

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
