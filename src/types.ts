import type { RetryOptions } from 'get-npm-meta'
import type { Agent } from 'package-manager-detector'
import type { PnpmWorkspaceYaml } from 'pnpm-workspace-yaml'
import type { Document, Scalar } from 'yaml'
import type { MODE_CHOICES } from './constants'
import type { Manifest } from './manifests/types'
import type { SortOption } from './utils/sort'

export type { RetryOptions }

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
    | 'bun-workspace'
    | 'yarn-workspace'
    | 'github-actions'
    | 'node-version'

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
  'bun-workspace': 'bun-workspace',
  'yarn-workspace': 'yarn-workspace',
  'github-actions': 'github-actions',
  'node-version': 'node-version',
}

export type Protocol = 'npm' | 'jsr'

/**
 * The ecosystem a dependency belongs to, which decides how its versions are
 * fetched and resolved. This is the routing key for the registry axis
 * (`src/registries/*`) — orthogonal to {@link RawDep.source}, which describes
 * where* inside a manifest the dependency lives.
 */
export type PackageType = 'npm' | 'github-actions' | 'jsr' | 'node'

export interface RawDep {
  name: string
  currentVersion: string
  /**
   * Where the dependency lives inside its manifest (dependency field, catalog,
   * override, etc.). Also drives grouping/labelling in the output.
   */
  source: DepType
  /**
   * Which ecosystem the dependency belongs to. Decides which registry
   * (`src/registries/*`) resolves it. Defaults to `'npm'` when omitted.
   */
  packageType?: PackageType
  update: boolean
  parents?: string[]
  protocol?: Protocol
  hexHash?: string
  /**
   * Extra metadata carried by GitHub Actions dependencies
   * (`packageType: 'github-actions'`).
   * Describes how the `uses:` reference is written so it can be updated in place.
   */
  githubAction?: GitHubActionInfo
}

export type GitHubActionStyle = 'auto' | 'tag' | 'sha'

export interface GitHubActionsOptions {
  /**
   * How to write updated `uses:` references.
   *
   * - `auto` — preserve each action's existing style (tag stays a tag, a
   *   SHA-pinned action stays SHA-pinned with a refreshed `# vX.Y.Z` comment)
   * - `tag` — always write a tag reference
   * - `sha` — always write a commit-SHA reference with a `# vX.Y.Z` comment
   *
   * @default 'auto'
   */
  style?: GitHubActionStyle
}

export interface GitHubActionInfo {
  /**
   * The `owner/repo` slug of the action (without any subpath).
   */
  repo: string
  /**
   * Any subpath after `owner/repo`, including the leading slash
   * (e.g. `/.github/workflows/ci.yml` for a reusable workflow call), or `''`.
   */
  subpath: string
  /**
   * How the reference is currently written in the file.
   */
  style: 'tag' | 'sha'
  /**
   * The current commit SHA, when the reference is SHA-pinned.
   */
  sha?: string
  /**
   * The resolved target commit SHA (filled in during resolving).
   */
  targetSha?: string
  /**
   * Reference to the YAML scalar node holding the `uses:` value, used to
   * update the reference in place while preserving formatting and comments.
   */
  node?: Scalar
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
  integrity?: Record<string, string>
  /**
   * Map of GitHub Action tag -> commit SHA (only populated for
   * `source: 'github-actions'` dependencies).
   */
  shaMap?: Record<string, string>
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
  filteredVersions?: string[]
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'

export interface CommonOptions {
  cwd?: string
  recursive?: boolean
  ignorePaths?: string | string[]
  ignoreOtherWorkspaces?: boolean
  include?: string | string[]
  /**
   * Dependencies to exclude from being checked/updated.
   *
   * Supports `name@range` to exclude only the matching versions (e.g. `typescript@7`
   * or `typescript@^7||^8`) instead of excluding the whole package, so other
   * major/minor/patch updates for that package are still offered (including in
   * interactive mode).
   */
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
   * API endpoint for fetching npm package metadata via `fast-npm-meta`
   *
   * @default 'https://npm.antfu.dev/'
   */
  fastNpmMetaApiEndpoint?: string
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
  /**
   * Custom manifests (file sources) to check, merged with the built-in ones.
   *
   * Custom manifests take precedence over the built-ins when matching a file or
   * routing a write, so they can extend taze with new file types or override
   * how an existing one is handled. To be discovered, a custom manifest should
   * provide a `discover` hook.
   *
   * Only available programmatically or from a JS/TS config file
   * (`taze.config.ts`), not from `.tazerc.json`.
   */
  manifests?: Manifest[]
  /**
   * Check and update GitHub Actions referenced in `.github/workflows/*.yml`
   * and composite `action.yml` files.
   *
   * Auto-enabled when a `.github/workflows` directory exists. Set to `false`
   * to opt out, or pass an object to configure the behavior.
   *
   * @default true
   */
  githubActions?: boolean | GitHubActionsOptions
  /**
   * Check and update the Node.js version declared in `.node-version` and
   * `.nvmrc` files.
   *
   * Enabled by default. Set to `false` to opt out.
   *
   * @default true
   */
  nodeVersion?: boolean
}

export type DepFieldOptions = Partial<Record<DepType, boolean>>

export interface CheckOptions extends CommonOptions {
  mode?: RangeMode
  write?: boolean
  all?: boolean
  sort?: SortOption
  interactive?: boolean
  /**
   * Output update info as JSON to stdout.
   *
   * When enabled, `interactive` is ignored and no progress bars,
   * tables, or tips are printed.
   *
   * @default false
   */
  json?: boolean
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
   * Request timeout in milliseconds when fetching package metadata
   *
   * @default 5000
   */
  requestTimeout?: number
  /**
   * Retry behavior when fetching package metadata from the registry fails
   *
   * Can be:
   * - a number for simple retry count
   * - `false` to disable retries
   * - a `RetryOptions` object for fine-grained control
   *
   * @default 4
   */
  retry?: number | false | RetryOptions
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
  /**
   * Dependencies that bypass the maturity period filter
   */
  maturityPeriodExclude?: string | string[]
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
  raw: Record<string, unknown>
}

export interface GlobalPackageMeta extends BasePackageMeta {
  agent: Agent
  type: 'global'
  raw: null
}

export interface PnpmWorkspaceMeta extends BasePackageMeta {
  type: 'pnpm-workspace.yaml'
  raw: Record<string, any>
  context: PnpmWorkspaceYaml
}

export interface BunWorkspaceMeta extends BasePackageMeta {
  type: 'bun-workspace'
  raw: Record<string, any>
}

export interface YarnWorkspaceMeta extends BasePackageMeta {
  type: '.yarnrc.yml'
  raw: Record<string, any>
  context: PnpmWorkspaceYaml
}

export interface PackageYamlMeta extends BasePackageMeta {
  /**
   * Package type
   */
  type: 'package.yaml'
  /**
   * Raw package.yaml Object
   */
  raw: Record<string, unknown>
  /**
   * Raw package.yaml Document
   */
  yamlDocument: Document
}

export interface GitHubActionMeta extends BasePackageMeta {
  /**
   * File type — a GitHub workflow or composite action YAML file
   */
  type: 'github-action'
  /**
   * Raw parsed YAML object
   */
  raw: Record<string, unknown>
  /**
   * Raw YAML Document, used to update `uses:` references in place
   */
  yamlDocument: Document
}

/**
 * A parsed `.node-version` / `.nvmrc` file. The whole file content is kept as
 * `lines` so comments, blank lines and formatting can be round-tripped; only
 * the single version token on `versionLineIndex` is rewritten on save.
 */
export interface NodeVersionFileRaw extends Record<string, unknown> {
  /** All lines of the file (split on `\n`, line endings preserved). */
  lines: string[]
  /** Index into `lines` of the line that holds the version reference. */
  versionLineIndex: number
  /** Whitespace before the version token on that line. */
  leading: string
  /** Whitespace (and any trailing `\r`) after the version token. */
  trailing: string
}

export interface NodeVersionMeta extends BasePackageMeta {
  /**
   * File type — a `.node-version` or `.nvmrc` file
   */
  type: 'node-version'
  /**
   * Raw file structure, used to rewrite the version in place while preserving
   * comments and formatting.
   */
  raw: NodeVersionFileRaw
}

export type PackageMeta
  = | PackageJsonMeta
    | GlobalPackageMeta
    | PnpmWorkspaceMeta
    | BunWorkspaceMeta
    | YarnWorkspaceMeta
    | PackageYamlMeta
    | GitHubActionMeta
    | NodeVersionMeta

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
