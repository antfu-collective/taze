import { DependenciesType, RawDependency, ResolvedDependencies } from '../types'

export function parseDependencies(pkg: any, type: DependenciesType): RawDependency[] {
  return Object.entries(pkg[type] || {}).map(([name, version]) => ({
    name,
    currentVersion: version as string,
    source: type,
  }))
}

export function dumpDependencies(deps: ResolvedDependencies[], type: DependenciesType) {
  const data: Record<string, string> = {}
  deps
    .filter(i => i.source === type)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((i) => {
      data[i.name] = i.update ? i.latestVersion : i.currentVersion
    })
  return data
}
