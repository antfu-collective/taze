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
  update: boolean
}

export type DiffType = ReturnType<typeof semver['diff']> | 'error'

export interface ResolvedDependencies extends RawDependency {
  targetVersion: string
  targetVersionTime?: string
  currentVersionTime?: string
  diff: DiffType
  resolveError?: Error | string | null
}

export interface CommonOptions {
  cwd: string
  recursive?: boolean
  include?: string
  exclude?: string
  prod?: boolean
  dev?: boolean
}

export interface UsageOptions extends CommonOptions {
  detail: boolean
  recursive: true
}

export interface CheckOptions extends CommonOptions {
  mode: string
  write: boolean
  showAll: boolean
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
export type DependencyResolvedCallback = (packageName: string | null, depName: string, progress: number, total: number) => void
