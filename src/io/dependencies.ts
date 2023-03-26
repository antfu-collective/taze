import type { DepType, RawDep, ResolvedDepChange } from '../types'

export function parseDependencies(pkg: any, type: DepType, shouldUpdate: (name: string) => boolean): RawDep[] {
  const deps = pkg[type] || {}
  const result: RawDep[] = []

  for (const [name, version] of Object.entries(deps))
    result.push(parseDependency(name, version as string, type, shouldUpdate))

  return result
}

export function parseDependency(name: string, version: string, type: DepType, shouldUpdate: (name: string) => boolean): RawDep {
  return {
    name,
    currentVersion: version,
    source: type,
    // when `updated` marked to `false`, it will be bypassed on resolving
    update: shouldUpdate(name),
  }
}

export function dumpDependencies(deps: ResolvedDepChange[], type: DepType) {
  const data: Record<string, string> = {}

  for (const dep of deps) {
    if (dep.source === type)
      data[dep.name] = dep.update ? dep.targetVersion : dep.currentVersion
  }

  return data
}
