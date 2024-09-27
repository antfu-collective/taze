import type { PackageData } from '../types'
import process from 'node:process'
import { getVersions, pickRegistry } from 'fast-npm-meta'
import { fetch } from 'ofetch'
import { joinURL } from 'ufo'

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

const TIMEOUT = 5000
const NPM_REGISTRY = 'https://registry.npmjs.org/'

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
      }),
      new Promise<ReturnType<typeof getVersions>>(
        (_, reject) => setTimeout(() => reject(new Error(`Timeout requesting "${spec}"`)), TIMEOUT),
      ),
    ])
    return {
      tags: data.distTags,
      versions: data.versions,
      time: data.time,
    }
  }

  const npmRegistryFetch = await import('npm-registry-fetch')

  const url = joinURL(npmRegistryFetch.pickRegistry(spec, npmConfigs), name)
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

  return {
    ...packument,
    tags: packument['dist-tags'],
    versions: Object.keys(packument.versions),
  }
}
