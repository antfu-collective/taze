import type semver from 'semver'

export type RangeMode = 'default' | 'major' | 'minor' | 'patch' | 'latest' | 'newest'
export type DependenciesType = 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies'
export const DependenciesTypeShortMap = {
  dependencies: '',
  devDependencies: 'dev',
  peerDependencies: 'peer',
  optionalDependencies: 'optional',
}

export interface RawDependency {
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
  resolveError?: number | string | Error
}

export interface CheckOptions {
  cwd: string
  recursive: boolean
  mode: RangeMode
  write: boolean
  filter: string[]
}

export interface PackageMeta {
  /**
   * Package name
   */
  name: string
  /**
   * Package version
   */
  version: string
  /**
   * Absolute filepath
   */
  filepath: string
  /**
   * Relative filepath to the root project
   */
  relative: string
  /**
   * Raw package.json Object
   */
  raw: any
  /**
   * Dependencies
   */
  deps: RawDependency[]
  /**
   * Resolved dependencies
   */
  resolved: ResolvedDependencies[]
}

export type DependencyFilter = (dep: RawDependency) => boolean | Promise<boolean>
export type ProgressCallback = (v: number, total: number, current: string) => void
