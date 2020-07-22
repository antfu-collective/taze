import semver from 'semver'
import { readJSON } from './read-packages'

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
