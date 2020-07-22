import pacote from 'pacote'
import semver from 'semver'
// @ts-ignore
import libnpmconfig from 'libnpmconfig'
import { RawDependencies, ResolvedDependencies } from './load-dependencies'

// needed until pacote supports full npm config compatibility
// See: https://github.com/zkat/pacote/issues/156
const npmConfig: any = {}
libnpmconfig.read().forEach((value: string, key: string) => {
  // replace env ${VARS} in strings with the process.env value
  npmConfig[key] = typeof value !== 'string'
    ? value
    : value.replace(/\${([^}]+)}/, (_, envVar) =>
      (process.env as any)[envVar],
    )
})
npmConfig.cache = false

const versionCache: Record<string, string> = {}

export async function getLatestVersion(name: string) {
  if (versionCache[name])
    return versionCache[name]
  const data = await pacote.packument(name, { ...npmConfig })
  versionCache[name] = data['dist-tags'].latest
  return versionCache[name]
}

export async function checkUpdates(deps: RawDependencies[]) {
  return Promise.all(
    (deps as ResolvedDependencies[]).map(async(dep) => {
      try {
        dep.latestVersion = await getLatestVersion(dep.name)
        dep.diff = semver.diff(semver.minVersion(dep.currentVersion)!, dep.latestVersion)
        dep.update = dep.diff !== null
      }
      catch (e) {
        console.error(e)
        dep.latestVersion = dep.currentVersion || 'error'
        dep.diff = dep.diff || 'error'
        dep.update = false
      }
      return dep
    }),
  )
}
