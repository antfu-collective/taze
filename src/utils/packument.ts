import process from 'node:process'
import npmRegistryFetch from 'npm-registry-fetch'
import { joinURL } from 'ufo'

import type { Packument, Options as PacoteOptions } from 'pacote'

export async function fetchPackumentWithFullMetaData(name: string, opts: PacoteOptions): Promise<Packument> {
  const registry = npmRegistryFetch.pickRegistry(name, opts)
  const url = joinURL(registry, name)
  const fetchOptions = {
    ...opts,
    headers: {
      'user-agent': opts.userAgent || `taze@npm node/${process.version}`,
      // use `application/json` to fetch full metadata
      'accept': 'application/json',
      ...opts.headers,
    },
    spec: name,
  }

  return npmRegistryFetch.json(url, fetchOptions) as unknown as Promise<Packument>
}
