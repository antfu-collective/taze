import pacote from 'pacote'
import semver from 'semver'
import { Modes } from '../modes'
import { npmConfig } from '../utils/npm'
import { RawDependencies, ResolvedDependencies } from './load-dependencies'

const versionCache: Record<string, string[]> = {}

export async function getLatestVersions(name: string) {
  if (versionCache[name])
    return versionCache[name]
  const data = await pacote.packument(name, { ...npmConfig })
  versionCache[name] = Object.keys(data.versions || {})
  return versionCache[name]
}

export function resetRange(version: string, mode: Modes) {
  if (mode === 'any')
    return '*'

  if (!semver.validRange(version))
    return null

  if (mode === 'range')
    return version

  const min = semver.minVersion(version)
  if (!min)
    return null

  return {
    major: '>=',
    minor: '^',
    patch: '~',
  }[mode] + min
}

export async function checkUpdates(deps: RawDependencies[], mode: Modes) {
  return Promise.all(
    (deps as ResolvedDependencies[]).map(async(dep) => {
      const versions = await getLatestVersions(dep.name)
      const range = resetRange(dep.currentVersion, mode)
      if (range) {
        const max = semver.maxSatisfying(versions, range)
        // TODO: align the range
        dep.latestVersion = max ? `^${max}` : dep.currentVersion
        dep.diff = semver.diff(semver.minVersion(dep.currentVersion)!, semver.minVersion(dep.latestVersion)!)
        dep.update = dep.diff !== null
      }
      else {
        dep.latestVersion = dep.currentVersion
        dep.diff = 'error'
        dep.update = false
      }

      return dep
    }),
  )
}
