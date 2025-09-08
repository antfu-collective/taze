import type { Agent } from 'package-manager-detector'
import type { PnpmWorkspaceYaml } from 'pnpm-workspace-yaml'
import type { MODE_CHOICES } from './constants'
import type { SortOption } from './utils/sort'

export type RangeMode = typeof MODE_CHOICES[number]
export type PackageMode = Exclude<RangeMode, 'default'> | 'ignore'
export type DepType
  = | 'dependencies'
    | 'devDependencies'
    | 'peerDependencies'
    | 'optionalDependencies'
    | 'packageManager'
    | 'pnpm.overrides'
    | 'resolutions'
    | 'overrides'
    | 'pnpm-workspace'

export const DependenciesTypeShortMap = {
  'packageManager': 'package-manager',
  'dependencies': '',
  'devDependencies': 'dev',
  'peerDependencies': 'peer',
  'optionalDependencies': 'optional',
  'resolutions': 'resolutions',
  'overrides': 'overrides',
  'pnpm.overrides': 'pnpm-overrides',
  'pnpm-workspace': 'pnpm-workspace',
}

export type Protocol = 'npm' | 'jsr'

export interface RawDep {
  name: string
  currentVersion: string
  source: DepType
  update: boolean
  parents?: string[]
  protocol?: Protocol
}

export type DiffType = 'major' | 'minor' | 'patch' | 'error' | null

export interface PackageData {
  tags: Record<string, string>
  versions: string[]
  time?: Record<string, string>
  nodeSemver?: Record<string, string>
  // raw?: Packument
  error?: Error | string
  provenance?: Record<string, boolean | 'trustedPublisher'>
  deprecated?: Record<string, string | boolean>
}

export interface JsrPackageMeta {
  scope: string
  name: string
  latest: string
  versions: Record<string, JsrPackageVersionMeta>
}

export interface JsrPackageVersionMeta {
  yanked?: boolean
}

export interface ResolvedDepChange extends RawDep {
  latestVersionAvailable?: string
  targetVersion: string
  targetVersionTime?: string
  currentVersionTime?: string
  targetProvenance?: boolean | 'trustedPublisher'
  currentProvenance?: boolean | 'trustedPublisher'
  provenanceDowngraded: boolean
  diff: DiffType
  pkgData: PackageData
  resolveError?: Error | string | null
  aliasName?: string
  nodeCompatibleVersion?: { semver: string, compatible: boolean }
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'

export interface CommonOptions {
  cwd?: string
  recursive?: boolean
  ignorePaths?: string | string[]
  ignoreOtherWorkspaces?: boolean
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
   * Include peerDependencies in the update process
   */
  peer?: boolean
  /**
   * Override bumping mode for specific dependencies
   */
  packageMode?: { [name: string]: PackageMode }
  /**
   * Custom addons
   *
   * @default builtin addons
   */
  addons?: Addon[]
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
   * Number of concurrent requests
   *
   * @default 10
   */
  concurrency?: number
  /**
   * Group dependencies by source, e.g. dependencies, devDependencies, etc.
   *
   * @default true
   */
  group?: boolean
  /**
   * include locked dependencies & devDependencies
   * @default false
   * @description exclude the locked deps/devDeps by default
   */
  includeLocked?: boolean
  /**
   * Show time difference between the current and the updated version
   *
   * @default true
   * @description hide the time difference
   */
  timediff?: boolean
  /**
   * Show package compatibility with current node version
   *
   * @default true
   */
  nodecompat?: boolean
  /**
   * Wait period in days before upgrading to newly released packages
   * This helps avoid potentially malicious packages released recently
   *
   * @default 0 (no waiting period)
   */
  maturityPeriod?: number
}

interface BasePackageMeta {
  /**
   * Package name
   */
  name: string
  /**
   * Is private package
   */
  private: boolean
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
   * Dependencies
   */
  deps: RawDep[]
  /**
   * Resolved dependencies
   */
  resolved: ResolvedDepChange[]
}

export interface PackageJsonMeta extends BasePackageMeta {
  /**
   * Package type
   */
  type: 'package.json'
  /**
   * Raw package.json Object
   */
  raw: any
}

export interface GlobalPackageMeta extends BasePackageMeta {
  agent: Agent
  type: 'global'
  raw: null
}

export interface PnpmWorkspaceMeta extends BasePackageMeta {
  type: 'pnpm-workspace.yaml'
  raw: any
  context: PnpmWorkspaceYaml
}

export type PackageMeta
  = | PackageJsonMeta
    | GlobalPackageMeta
    | PnpmWorkspaceMeta

export type DependencyFilter = (dep: RawDep) => boolean | Promise<boolean>
export type DependencyResolvedCallback = (packageName: string | null, depName: string, progress: number, total: number) => void

export interface InteractiveContext {
  /**
   * Whether the dependency is selected with cursor in the interactive list.
   */
  isSelected: (dep: RawDep) => boolean

  /**
   * Whether the dependency is marked as checked in the interactive list.
   */
  isChecked: (dep: RawDep) => boolean
}

export interface Addon {
  postprocess?: (
    pkg: PackageMeta,
    options: CheckOptions,
  ) => void | Promise<void>

  beforeWrite?: (
    pkg: PackageMeta,
    options: CheckOptions,
  ) => void | Promise<void>
}
