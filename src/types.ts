import type { MODE_CHOICES } from './constants'
import type { SortOption } from './utils/sort'

export type RangeMode = typeof MODE_CHOICES[number]
export type PackageMode = Exclude<RangeMode, 'default'> | 'ignore'
export type DepType =
  | 'dependencies'
  | 'devDependencies'
  | 'peerDependencies'
  | 'optionalDependencies'
  | 'packageManager'
  | 'pnpm.overrides'
  | 'resolutions'
  | 'overrides'
  | 'pnpm:catalog'

export const DependenciesTypeShortMap = {
  'dependencies': '',
  'devDependencies': 'dev',
  'peerDependencies': 'peer',
  'optionalDependencies': 'optional',
  'packageManager': 'package-manager',
  'pnpm.overrides': 'pnpm-overrides',
  'resolutions': 'resolutions',
  'overrides': 'overrides',
  'pnpm:catalog': 'pnpm-catalog',
}

export interface RawDep {
  name: string
  currentVersion: string
  source: DepType
  update: boolean
  parents?: string[]
}

export type DiffType = 'major' | 'minor' | 'patch' | 'error' | null

export interface PackageData {
  tags: Record<string, string>
  versions: string[]
  time?: Record<string, string>
  // raw?: Packument
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
  aliasName?: string
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'

export interface CommonOptions {
  cwd?: string
  recursive?: boolean
  ignorePaths?: string | string[]
  include?: string | string[]
  exclude?: string | string[]
  loglevel?: LogLevel
  failOnOutdated?: boolean
  silent?: boolean
  /**
   * Fields in package.json to be checked
   * By default all fields will be checked
   */
  depFields?: DepFieldOptions
  /**
   * Bypass cache
   */
  force?: boolean
  /**
   * Override bumping mode for specific dependencies
   */
  packageMode?: { [name: string]: PackageMode }
}

export interface UsageOptions extends CommonOptions {
  detail?: boolean
  recursive?: true
}

export type DepFieldOptions = Partial<Record<DepType, boolean>>

export interface CheckOptions extends CommonOptions {
  mode?: RangeMode
  write?: boolean
  all?: boolean
  sort?: SortOption
  interactive?: boolean
  install?: boolean
  update?: boolean
  global?: boolean
  /**
   * include locked dependencies & devDependencies
   * @default false
   * @description exclude the locked deps/devDeps by default
   */
  includeLocked?: boolean
}

export interface PackageMeta {
  /**
   * Package name
   */
  name: string
  /**
   * Is private package
   */
  private: boolean
  /**
   * Package type
   */
  type: 'package.json' | 'pnpm-workspace.yaml' | 'global'
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
  isSelected: (dep: RawDep) => boolean
}
