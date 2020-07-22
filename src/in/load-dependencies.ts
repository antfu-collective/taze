import { readJSON } from './read-packages'

export type DependenciesType = 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies'

export interface Dependencies {
  name: string
  currentVersion: string
  latestVersion?: string
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

export function parseDependencies(pkg: any, type: DependenciesType): Dependencies[] {
  return Object.entries(pkg[type] || {}).map(([name, version]) => ({
    name,
    currentVersion: version as string,
    source: type,
  }))
}
