import type { PackageVersionsInfoWithMetadata } from 'fast-npm-meta'
import type { JsrPackageMeta, PackageData } from '../types'
import process from 'node:process'
import { getVersions, pickRegistry } from 'fast-npm-meta'
import { fetch } from 'ofetch'
import { joinURL } from 'ufo'

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

const TIMEOUT = 5000
const NPM_REGISTRY = 'https://registry.npmjs.org/'
const JSR_API_REGISTRY = 'https://jsr.io/'

export async function fetchPackage(spec: string, npmConfigs: Record<string, unknown>, force = false): Promise<PackageData> {
  const { default: npa } = await import('npm-package-arg')
  const { name, scope } = npa(spec)

  if (!name)
    throw new Error(`Invalid package name: ${name}`)

  const registry = pickRegistry(scope, npmConfigs)

  if (registry === NPM_REGISTRY) {
    const data = await Promise.race([
      getVersions(spec, {
        force,
        fetch,
        throw: false,
        metadata: true,
      }),
      new Promise<ReturnType<typeof getVersions>>(
        (_, reject) => setTimeout(() => reject(new Error(`Timeout requesting "${spec}"`)), TIMEOUT),
      ),
    ]) as PackageVersionsInfoWithMetadata

    if ('error' in data) {
      throw new Error(`Failed to fetch package "${spec}": ${data.error}`)
    }

    const deprecated: Record<string, string | boolean> = {}
    Object.entries(data.versionsMeta).forEach(([version, meta]) => {
      if (meta.deprecated) {
        deprecated[version] = meta.deprecated
      }
    })

    return {
      tags: data.distTags,
      versions: Object.keys(data.versionsMeta),
      time: {
        ...Object.fromEntries(
          Object.entries(data.versionsMeta)
            .map(([version, meta]) => [version, meta.time]),
        ),
        created: data.timeCreated,
        modified: data.timeModified,
      },
      nodeSemver: { ...Object.fromEntries(
        Object.entries(data.versionsMeta)
          .map(([version, meta]) => [version, meta.engines?.node])
          .filter(([_, node]) => node),
      ) },
      provenance: { ...Object.fromEntries(
        Object.entries(data.versionsMeta)
          .map(([version, meta]) => [version, meta.provenance])
          .filter(([_, provenance]) => provenance),
      ) },
      deprecated: Object.keys(deprecated).length > 0 ? deprecated : undefined,
    }
  }

  const npmRegistryFetch = await import('npm-registry-fetch')

  const url = joinURL(registry, name)
  const packument = await Promise.race([
    npmRegistryFetch.json(url, {
      ...npmConfigs,
      headers: {
        'user-agent': `taze@npm node/${process.version}`,
        'accept': 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
        ...npmConfigs.headers as any,
      },
      spec,
    }) as unknown as Packument,
    new Promise<Packument>(
      (_, reject) => setTimeout(() => reject(new Error(`Timeout requesting "${spec}"`)), TIMEOUT),
    ),
  ])

  const deprecated: Record<string, string | boolean> = {}
  Object.entries(packument.versions).forEach(([version, meta]) => {
    if (meta.deprecated) {
      deprecated[version] = meta.deprecated
    }
  })

  return {
    ...packument,
    tags: packument['dist-tags'],
    versions: Object.keys(packument.versions),
    provenance: Object.fromEntries(
      Object.entries(packument.versions)
        // cannot detect trusted publisher since `_npmUser` is omitted
        .map(([version, meta]) => [version, !!meta.dist?.attestations?.provenance])
        .filter(([_, provenance]) => provenance),
    ),
    deprecated: Object.keys(deprecated).length > 0 ? deprecated : undefined,
  }
}

export async function fetchJsrPackageMeta(name: string): Promise<PackageData> {
  return Promise.race([
    fetch(joinURL(JSR_API_REGISTRY, name, 'meta.json'), {
      headers: {
        'user-agent': `taze@npm node/${process.version}`,
        'accept': 'application/json',
      },
    }).then(r => r.json()),
    new Promise<JsrPackageMeta>(
      (_, reject) => setTimeout(() => reject(new Error(`Timeout requesting "${name}"`)), TIMEOUT),
    ),
  ]) as Promise<PackageData>
}
