import process from 'node:process'
import type { Options } from 'npm-registry-fetch'
import { joinURL } from 'ufo'
import { $fetch } from 'ofetch'
import { getVersions } from 'fast-npm-meta'
import type { PackageData } from '../types'

// @types/pacote uses "import = require()" syntax which is not supported by unbuild
// So instead of using @types/pacote, we declare the type definition with only fields we need
interface Packument {
  'name': string
  /**
   * An object where each key is a version, and each value is the manifest for
   * that version.
   */
  'versions': Record<string, Omit<Packument, 'versions'>>
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

const NPM_REGISTRY = 'https://registry.npmjs.org/'

export async function fetchPackage(spec: string, opts: Options): Promise<PackageData> {
  const { default: npa } = await import('npm-package-arg')
  const { name } = npa(spec)

  if (!name)
    throw new Error(`Invalid package name: ${name}`)

  const npmRegistryFetch = await import('npm-registry-fetch')
  const registry = npmRegistryFetch.pickRegistry(spec, opts)

  if (registry === NPM_REGISTRY) {
    const data = await getVersions(spec)
    return {
      tags: data.distTags,
      versions: data.versions,
    }
  }

  const url = joinURL(registry, name)

  const packument = await $fetch(url, {
    headers: {
      'user-agent': `taze@npm node/${process.version}`,
      'accept': 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
      ...opts.headers,
    },
  }) as unknown as Packument

  return {
    tags: packument['dist-tags'],
    versions: Object.keys(packument.versions),
  }
}
