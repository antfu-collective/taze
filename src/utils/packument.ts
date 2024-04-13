import process from 'node:process'
import npmRegistryFetch from 'npm-registry-fetch'
import { joinURL } from 'ufo'
import npa from 'npm-package-arg'

import type { Packument, Options as PacoteOptions } from 'pacote'

export async function fetchPackumentWithFullMetaData(spec: string, opts: PacoteOptions): Promise<Packument> {
  const { name } = npa(spec)

  if (!name)
    throw new Error(`Invalid package name: ${name}`)

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
