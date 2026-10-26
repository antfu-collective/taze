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
    | 'devEngines.runtime'

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
  'devEngines.runtime': 'devEngines.runtime',
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

export type DiffType = 'major' | 'minor' | 'patch' | 'error' | 'pin' | null

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

export type ColorValue
  = | 'black' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white' | 'gray'
    | 'redBright' | 'greenBright' | 'yellowBright' | 'blueBright' | 'magentaBright' | 'cyanBright' | 'whiteBright'
    | `#${string}` | false

export interface ColorsOptions {
  /**
   * Foreground color of the project/package name at the start of a package summary.
   * Also used by the per-package up-to-date view. Dependency names in the table
   * use `dependencyName`; package progress bars use `progressPackage`.
   *
   * @default 'cyan'
   */
  packageName?: ColorValue

  /**
   * Foreground color of the catalog name in a catalog header.
   * For `pnpm-catalog:default`, this colors `default`; the `pnpm-catalog:`
   * prefix keeps its dim style. Applies to pnpm, Bun, and Yarn catalogs.
   *
   * @default 'yellow'
   */
  catalogName?: ColorValue

  /**
   * Foreground color of a dependency name when its update is active.
   * In interactive mode, active means checked for updating, independently of
   * which row has keyboard focus. Inactive names use `dependencyUnselected`;
   * active names with downgraded provenance use `provenanceWarningBg`.
   *
   * @default false
   */
  dependencyName?: ColorValue

  /**
   * Foreground color of the dim alias prefix before the underlying dependency name.
   * For an aliased dependency displayed as `alias-name ← actual-name`, this
   * colors `alias-name ← `. The prefix remains dim when a color is configured;
   * `false` leaves it without its own foreground color.
   *
   * @default false
   */
  dependencyAlias?: ColorValue

  /**
   * Foreground color of dependency section headings when `group` is enabled.
   * Examples include `dependencies`, `devDependencies`, and `peerDependencies`.
   * The abbreviated source column in ungrouped output uses `dependencyType`.
   *
   * @default 'blue'
   */
  dependencyGroup?: ColorValue

  /**
   * Foreground color of the abbreviated dependency source column when `group` is false.
   * Examples include `dev`, `peer`, and `optional`. Grouped output instead
   * shows section headings colored by `dependencyGroup`.
   *
   * @default 'gray'
   */
  dependencyType?: ColorValue

  /**
   * Foreground color of the name and target version of a dependency whose update is inactive.
   * Used for unchecked rows in interactive mode and non-updating rows shown
   * by `all`. The inactive target version retains its strikethrough style;
   * the current-version column still uses `versionCurrent`.
   *
   * @default 'gray'
   */
  dependencyUnselected?: ColorValue

  /**
   * Foreground color of the `›` marker in the header of a package with no name.
   * The marker precedes the relative manifest path, such as `› package.json`.
   * The path itself retains its dim style.
   *
   * @default 'red'
   */
  packagePathMarker?: ColorValue

  /**
   * Foreground color of `npm` or `pnpm` in a global-package summary header.
   * The adjacent `(global)` label and installation path use `globalPackageInfo`.
   * Progress bar labels for global packages use `progressDependency`.
   *
   * @default 'red'
   */
  packageManager?: ColorValue

  /**
   * Foreground color of the extra information in global-package summary headers.
   * Applies to the `(global)` label and, for pnpm, the global installation path.
   * These pieces keep their dim style; the manager name uses `packageManager`.
   *
   * @default 'gray'
   */
  globalPackageInfo?: ColorValue

  /**
   * Foreground color of the per-package `✓ up to date` line when that view is rendered.
   * This is the status inside an individual package's output when `all` is enabled.
   * The overall `dependencies are already up-to-date` message uses `messageSuccess`.
   *
   * @default 'gray'
   */
  upToDate?: ColorValue

  /**
   * Foreground color of the current declared version on the left of an update.
   * For example, colors `^1.0.0` in `^1.0.0 → ^2.0.0`.
   * Also applies to the current-version column in the version selection list.
   *
   * @default 'gray'
   */
  versionCurrent?: ColorValue

  /**
   * Foreground color of changed version digits for a major update and its numeric summary count.
   * Version highlighting starts at the first differing segment: `1.2.3 → 2.0.0`
   * colors `2.0.0`. The leading range prefix is controlled separately by
   * `versionRange` and `versionRangeChanged`.
   *
   * @default 'red'
   */
  versionMajor?: ColorValue

  /**
   * Foreground color of changed version digits for a minor update and its numeric summary count.
   * For `1.2.3 → 1.3.0`, the highlighted portion is `3.0`.
   * Shared leading version segments keep their existing uncolored appearance.
   *
   * @default 'cyan'
   */
  versionMinor?: ColorValue

  /**
   * Foreground color of changed version digits for a patch update and its numeric summary count.
   * For `1.2.3 → 1.2.4`, the highlighted portion is `4`.
   * Also used as the fallback version-difference color when no diff type is available.
   *
   * @default 'green'
   */
  versionPatch?: ColorValue

  /**
   * Foreground color of a pinned target version or shortened GitHub Action commit SHA.
   * Also colors the numeric `pin` count in the package summary.
   * A trailing version annotation such as `# v4.2.0` keeps its dim style.
   *
   * @default 'blue'
   */
  versionPin?: ColorValue

  /**
   * Foreground color of the numeric error count in a package's version-change summary.
   * Used when a dependency's diff classification is `error`.
   * Dependency resolution error text and the ERROR badge use `messageError`.
   *
   * @default 'red'
   */
  versionError?: ColorValue

  /**
   * Foreground color of an unchanged leading `^` or `~` in the target version.
   * Also used for that prefix when range-prefix highlighting is disabled.
   * The version digits are styled independently according to the version diff type.
   *
   * @default 'gray'
   */
  versionRange?: ColorValue

  /**
   * Foreground color of a target version's leading `^` or `~` when the range prefix changes.
   * For `^1.0.0 → ~2.0.0`, this colors the new `~`.
   * Applies when range-prefix highlighting is enabled; unchanged prefixes use `versionRange`.
   *
   * @default 'yellow'
   */
  versionRangeChanged?: ColorValue

  /**
   * Foreground color of the dim `(x.y.z available)` notice after a dependency row.
   * Shown when a newer available version differs from the chosen target version.
   * The notice retains its dim style, independently of the target version's diff color.
   *
   * @default 'magenta'
   */
  versionAvailable?: ColorValue

  /**
   * Foreground color of the dim `→` between current and target versions.
   * Used in dependency rows and the version selection list.
   * The arrow between provenance status labels uses `provenanceArrow`.
   *
   * @default 'gray'
   */
  versionArrow?: ColorValue

  /**
   * Foreground color of a dependency's Node.js engine range when it is compatible.
   * Shown when Node.js compatibility information is available and `nodecompat` is enabled.
   * The range remains dim. The default `false` adds no foreground color.
   *
   * @default false
   */
  nodeCompatible?: ColorValue

  /**
   * Foreground color of a dependency's Node.js engine range when it is incompatible
   * with the current Node.js version. Shown when compatibility information is
   * available and `nodecompat` is enabled; compatible ranges use `nodeCompatible`.
   *
   * @default 'red'
   */
  nodeIncompatible?: ColorValue

  /**
   * Foreground color of the `<1h` release-age label for elapsed times below one hour.
   * Release ages describe time since publication, rather than calendar dates.
   * Applies to both current and target release ages when `timediff` is enabled
   * and the registry provides the corresponding publication timestamp.
   *
   * @default 'gray'
   */
  releaseAgeUnderHour?: ColorValue

  /**
   * Foreground color of release ages from one hour up to, but excluding, 100 hours.
   * The elapsed time is rounded to whole hours and displayed as `~24h`.
   * Applies to both current and target releases; ages of 100 hours or more
   * move to `releaseAgeDays`, even though a rounded hours label can reach `~100h`.
   *
   * @default 'green'
   */
  releaseAgeHours?: ColorValue

  /**
   * Foreground color of release ages from 100 hours up to, but excluding, 30 days.
   * The elapsed time is rounded to whole days and displayed as `~7d`.
   * Applies to both current and target release-age columns when `timediff` is enabled.
   *
   * @default 'green'
   */
  releaseAgeDays?: ColorValue

  /**
   * Foreground color of release ages from 30 days up to, but excluding, 365 days.
   * Each month is treated as 30 days; the result is rounded and displayed as `~3mo`.
   * Applies to both release-age columns. This is independent of version-change
   * colors, so changing it does not recolor major/minor/patch updates.
   *
   * @default 'yellow'
   */
  releaseAgeMonths?: ColorValue

  /**
   * Foreground color of release ages of 365 days or more, such as `~1.5y`.
   * Each year is treated as 365 days, and the value is rounded to one decimal
   * place with a trailing `.0` omitted. Applies to both release-age columns.
   *
   * @default 'red'
   */
  releaseAgeYears?: ColorValue

  /**
   * Foreground color of the `❯` pointer identifying the row with keyboard focus.
   * Used in both the dependency list and the version selection list.
   * Focus moves with the navigation keys; checked state is indicated separately
   * by `interactiveChecked` and `interactiveUnchecked`.
   *
   * @default 'cyan'
   */
  interactivePointer?: ColorValue

  /**
   * Foreground color of the `◉` marker for a dependency checked for updating.
   * A checked dependency can be on any row, independently of keyboard focus.
   * This option colors the marker; the dependency name uses `dependencyName`.
   *
   * @default 'green'
   */
  interactiveChecked?: ColorValue

  /**
   * Foreground color of the `◌` marker for a dependency not checked for updating.
   * The unchecked dependency's name and target version use `dependencyUnselected`.
   * The focused row is identified independently by `interactivePointer`.
   *
   * @default 'gray'
   */
  interactiveUnchecked?: ColorValue

  /**
   * Foreground color of the keyboard help text above the dependency list
   * and the `Select a version for ... (current ...)` heading in version selection.
   * Highlighted key names and the dependency name within these lines use
   * `interactiveKey` and `interactiveDependencyName`, respectively.
   *
   * @default 'gray'
   */
  interactiveHint?: ColorValue

  /**
   * Foreground color of key names emphasized in the interactive keyboard help.
   * Examples include `↑↓`, `space`, `enter`, `esc`, and `a`.
   * The key names remain bold; the surrounding explanation uses `interactiveHint`.
   *
   * @default 'green'
   */
  interactiveKey?: ColorValue

  /**
   * Foreground color of the `┃` border beside interactive help and version headings.
   * The border retains its bold and dim styles.
   * Applies to both the dependency selection screen and the version selection screen.
   *
   * @default 'gray'
   */
  interactiveBorder?: ColorValue

  /**
   * Foreground color of the dependency name in the version selection heading.
   * For `Select a version for vue (current ^3.0.0)`, this colors `vue`.
   * The name remains bold; dependency names in the main table use `dependencyName`.
   *
   * @default 'green'
   */
  interactiveDependencyName?: ColorValue

  /**
   * Foreground color of an unfocused version category or tag in version selection.
   * Examples include `minor`, `patch`, `latest`, and `next` when offered.
   * The category on the focused row retains its existing uncolored appearance;
   * the pointer and row background have their own interactive color options.
   *
   * @default 'gray'
   */
  interactiveVersionName?: ColorValue

  /**
   * Foreground color of the `-- END --` marker appended to a long dependency list.
   * The marker is added when the content reaches the terminal's available height
   * and becomes visible as the rendered slice reaches the end of the list.
   *
   * @default 'yellow'
   */
  interactiveEndMarker?: ColorValue

  /**
   * Background color of the row with keyboard focus in dependency or version selection.
   * Tracks the `❯` pointer independently of whether the dependency is checked.
   * The existing foreground colors and text styles are preserved; a specific
   * cell background such as `provenanceWarningBg` can still appear within the row.
   *
   * `false` leaves the terminal background in place. Set a color explicitly to
   * enable highlighting, for example `'#333'` on a dark terminal or `'#eee'` on a
   * light terminal. Applied to interactive TTY output when terminal colors are enabled.
   *
   * @default false
   */
  interactiveSelectedBg?: ColorValue

  /**
   * Foreground color of the current release's provenance status in a downgrade notice.
   * Labels such as `trusted`, `provenance`, or `untrusted` remain bold.
   * This is the status before the `provenanceArrow` in the dependency row.
   *
   * @default 'green'
   */
  provenanceCurrent?: ColorValue

  /**
   * Foreground color of the target release's provenance status in a downgrade notice.
   * The bold label appears after `provenanceArrow`, for example `untrusted`
   * in a change from `trusted → untrusted`.
   *
   * @default 'red'
   */
  provenanceTarget?: ColorValue

  /**
   * Foreground color of the dim `→` between current and target provenance labels.
   * Displayed for a dependency whose provenance has been downgraded.
   * The version-change arrow is controlled independently by `versionArrow`.
   *
   * @default 'gray'
   */
  provenanceArrow?: ColorValue

  /**
   * Foreground color of the provenance downgrade warning paragraph below a package's table.
   * Rendered when the displayed dependencies include a provenance downgrade.
   * The paragraph remains bold; row status labels and the dependency-name
   * background use the other `provenance*` color options.
   *
   * @default 'yellow'
   */
  provenanceWarning?: ColorValue

  /**
   * Background color behind the name of an actively updated dependency with downgraded provenance.
   * In interactive mode this warning background appears when that update is checked.
   * Unchecked names use `dependencyUnselected`. This background stays visible
   * within a focused row even when `interactiveSelectedBg` is enabled.
   *
   * @default 'red'
   */
  provenanceWarningBg?: ColorValue

  /**
   * Foreground color of overall success and up-to-date messages printed by the check command.
   * Examples include `dependencies are already up-to-date` and summaries of
   * packages already up to date. The individual `✓ up to date` line uses `upToDate`.
   *
   * @default 'green'
   */
  messageSuccess?: ColorValue

  /**
   * Foreground color of written-file notices and installation reminders.
   * Examples include `ℹ changes written to package.json` and the reminder to
   * install updated dependencies. Embedded commands use `hintCommand`.
   *
   * @default 'yellow'
   */
  messageWarning?: ColorValue

  /**
   * Foreground color of dependency resolution error text and the `ERROR` badge.
   * Examples include `package-name not found` and details of an unknown resolution error.
   * The badge retains its inverse and bold styles, so this color appears as
   * the badge background when inverse rendering swaps foreground and background.
   *
   * @default 'red'
   */
  messageError?: ColorValue

  /**
   * Foreground color of taze's `installing...` and `updating...` status lines.
   * These messages are printed immediately before invoking the package manager.
   * Applies to local updates and, for installation, global package updates.
   *
   * @default 'magenta'
   */
  operationStatus?: ColorValue

  /**
   * Foreground color of complete command snippets in usage hints and installation reminders.
   * Examples include `taze major` and `pnpm i`.
   * The surrounding message keeps its own color; individual suggested flags
   * or mode arguments use `hintArgument`.
   *
   * @default 'cyan'
   */
  hintCommand?: ColorValue

  /**
   * Foreground color of individual flags or mode arguments suggested by usage hints.
   * Examples include `-w`, `-i`, and the standalone `major` mode in global-update hints.
   * Complete suggested commands are colored by `hintCommand`.
   *
   * @default 'green'
   */
  hintArgument?: ColorValue

  /**
   * Foreground color of the question text in write/install confirmation prompts.
   * Examples include `write to package.json` and `install now`.
   * Applies to the question supplied by taze; the prompt library handles
   * its own input controls and answer indicators.
   *
   * @default 'green'
   */
  promptMessage?: ColorValue

  /**
   * Foreground color of the package progress bar's `pkg` label and current package name.
   * The package progress bar is created for recursive checks when packages are found.
   * Dependency progress bars use `progressDependency` for their labels.
   *
   * @default 'cyan'
   */
  progressPackage?: ColorValue

  /**
   * Foreground color of the dependency progress bar label.
   * The label is `dep` for local checks and the package manager name, such as
   * `npm` or `pnpm`, for global checks. The dependency name uses `progressName`.
   *
   * @default 'green'
   */
  progressDependency?: ColorValue

  /**
   * Foreground color applied to the `{name}` placeholder in progress bar output.
   * This normally displays the dependency currently being resolved.
   * Package progress bar names carry their own `progressPackage` color inside
   * this placeholder, which preserves the package-name emphasis.
   *
   * @default 'gray'
   */
  progressName?: ColorValue
}

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
   * Override colors by UI role with ANSI color names, hex colors (`#RGB` or
   * `#RRGGBB`), or `false` to disable an individual color. Unspecified colors
   * retain the original palette.
   */
  colors?: ColorsOptions
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

export interface NodeVersionMeta extends BasePackageMeta {
  /**
   * File type — a `.node-version` or `.nvmrc` file
   */
  type: 'node-version'
  /**
   * The file content split around the version token, so it can be rewritten in
   * place while preserving comments, blank lines and formatting.
   */
  raw: NodeVersionFileRaw
}

export interface NodeVersionFileRaw extends Record<string, unknown> {
  prefix: string
  suffix: string
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
