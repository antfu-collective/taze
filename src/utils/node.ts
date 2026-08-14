import type { PackageData } from '../types'
import process from 'node:process'
import { fetch as ofetch } from 'ofetch'
import { compareVersionReferences, parseVersionReference } from './versionReference'

const NODE_RELEASE_INDEX = 'https://nodejs.org/dist/index.json'
const USER_AGENT = `taze@npm node/${process.version}`

interface NodeRelease {
  version: string
  date: string
}

/**
 * Fetch the official Node.js release index and shape it into the shared
 * {@link PackageData} form: stable `vX.Y.Z` versions sorted ascending, with a
 * `latest` tag and a release-date map so `maturityPeriod` and time diffs work.
 */
export async function fetchNodeReleases(requestTimeout?: number): Promise<PackageData> {
  const res = await ofetch(NODE_RELEASE_INDEX, {
    headers: {
      'accept': 'application/json',
      'user-agent': USER_AGENT,
    },
    signal: requestTimeout ? AbortSignal.timeout(requestTimeout) : undefined,
  })

  if (!res.ok)
    throw new Error(`Failed to fetch Node.js releases: ${res.status}`)

  const releases = await res.json() as NodeRelease[]
  const stable = releases
    .map((release) => {
      const parsed = parseVersionReference(release.version, true)
      return parsed && parsed.segments === 3 && !parsed.prerelease
        ? { date: release.date, parsed }
        : null
    })
    .filter((release): release is NonNullable<typeof release> => !!release)
    .sort((a, b) => compareVersionReferences(a.parsed, b.parsed))

  const versions = stable.map(release => release.parsed.raw)
  const time = Object.fromEntries(
    stable.map(release => [release.parsed.raw, `${release.date}T00:00:00.000Z`]),
  )

  return {
    tags: versions.length ? { latest: versions.at(-1)! } : {},
    versions,
    time,
  }
}
