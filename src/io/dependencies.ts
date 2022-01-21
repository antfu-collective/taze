import type { DependenciesType, RawDependency, ResolvedDependencies } from '../types'

export function parseDependencies(pkg: any, type: DependenciesType, shouldUpdate: (name: string) => boolean): RawDependency[] {
  return Object.entries(pkg[type] || {}).map(([name, version]) => ({
    name,
    currentVersion: version as string,
    source: type,
    // when `updated` marked to `false`, it will be bypassed on resolving
    update: shouldUpdate(name),
  }))
}

export function dumpDependencies(deps: ResolvedDependencies[], type: DependenciesType) {
  const data: Record<string, string> = {}
  deps
    .filter(i => i.source === type)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((i) => {
      data[i.name] = i.update ? i.targetVersion : i.currentVersion
    })

  return data
}
