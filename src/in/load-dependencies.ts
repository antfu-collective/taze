import semver from 'semver'
import { readJSON, writeJSON } from './read-packages'

export type DependenciesType = 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies'
export const DependenciesTypeShortMap = {
  dependencies: '',
  devDependencies: 'dev',
  peerDependencies: 'peer',
  optionalDependencies: 'optional',
}

export interface RawDependencies {
  name: string
  currentVersion: string
  source: DependenciesType
}
export type DiffType = ReturnType<typeof semver['diff']> | 'error'

export interface ResolvedDependencies {
  name: string
  currentVersion: string
  latestVersion: string
  diff: DiffType
  source: DependenciesType
  update: boolean
}

export async function loadDependencies(filepath: string) {
  const pkg = await readJSON(filepath)
  const deps = [
    ...parseDependencies(pkg, 'dependencies'),
    ...parseDependencies(pkg, 'devDependencies'),
    ...parseDependencies(pkg, 'peerDependencies'),
    ...parseDependencies(pkg, 'optionalDependencies'),
  ]
  return {
    pkg,
    deps,
  }
}

export function parseDependencies(pkg: any, type: DependenciesType): RawDependencies[] {
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

export async function writeDependencies(filepath: string, deps: ResolvedDependencies[]) {
  const pkg = await readJSON(filepath)
  if (pkg.dependencies) pkg.dependencies = dumpDependencies(deps, 'dependencies')
  if (pkg.devDependencies) pkg.devDependencies = dumpDependencies(deps, 'devDependencies')
  if (pkg.peerDependencies) pkg.peerDependencies = dumpDependencies(deps, 'peerDependencies')
  if (pkg.optionalDependencies) pkg.optionalDependencies = dumpDependencies(deps, 'optionalDependencies')
  await writeJSON(filepath, pkg)
}
