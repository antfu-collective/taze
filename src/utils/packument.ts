import process from 'node:process'
import type { Options } from 'npm-registry-fetch'
import { joinURL } from 'ufo'

import type { Packument } from '../types'

export async function fetchPackumentWithFullMetaData(spec: string, opts: Options): Promise<Packument> {
  const { default: npa } = await import('npm-package-arg')
  const { name } = npa(spec)

  if (!name)
    throw new Error(`Invalid package name: ${name}`)

  const npmRegistryFetch = await import('npm-registry-fetch')

  const registry = npmRegistryFetch.pickRegistry(name, opts)

  const url = joinURL(registry, name)
  const fetchOptions = {
    ...opts,
    headers: {
      // ensure that we always send *something*, other wise npm registry will reject the request
      'user-agent': opts.userAgent || `taze@npm node/${process.version}`,
      // use `application/json` to fetch full metadata
      'accept': 'application/json',
      ...opts.headers,
    },
    spec: name,
  }

  return npmRegistryFetch.json(url, fetchOptions) as unknown as Promise<Packument>
}
