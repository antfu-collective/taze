import type { Packument } from 'pacote'
import type semver from 'semver'

export type RangeMode = 'default' | 'major' | 'minor' | 'patch' | 'latest' | 'newest'
export type DepType = 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies'
export const DependenciesTypeShortMap = {
  dependencies: '',
  devDependencies: 'dev',
  peerDependencies: 'peer',
  optionalDependencies: 'optional',
}

export interface RawDep {
  name: string
  currentVersion: string
  source: DepType
  update: boolean
}

export type DiffType = ReturnType<typeof semver['diff']> | 'error'

export interface PackageData {
  tags: Record<string, string>
  versions: string[]
  time?: Record<string, string>
  raw?: Packument
  error?: Error | string
}

export interface ResolvedDepChange extends RawDep {
  latestVersionAvailable?: string
  targetVersion: string
  targetVersionTime?: string
  currentVersionTime?: string
  diff: DiffType
  pkgData: PackageData
  resolveError?: Error | string | null
  interactiveChecked?: boolean
}

export interface CommonOptions {
  cwd: string
  recursive?: boolean
  include?: string | string[]
  exclude?: string | string[]
  prod?: boolean
  dev?: boolean
  loglevel: string
  silent?: boolean
  force?: boolean
}

export interface UsageOptions extends CommonOptions {
  detail: boolean
  recursive: true
}

export interface CheckOptions extends CommonOptions {
  mode: string
  write: boolean
  all: boolean
  interactive?: boolean
  install?: boolean
  update?: boolean
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
  deps: RawDep[]
  /**
   * Resolved dependencies
   */
  resolved: ResolvedDepChange[]
  interactiveChecked?: boolean
}

export type DependencyFilter = (dep: RawDep) => boolean | Promise<boolean>
export type DependencyResolvedCallback = (packageName: string | null, depName: string, progress: number, total: number) => void

export interface InteractiveContext {
  isSelected(dep: RawDep): boolean
}
