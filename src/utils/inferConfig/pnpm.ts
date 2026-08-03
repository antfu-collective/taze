import { up as findUp } from 'empathic/find'
import { debug, parseSemverParts, readStringList, readYamlTop } from './shared'

// pnpm v11+ enables `minimumReleaseAge` by default at 1440 minutes (1 day).
// See https://pnpm.io/settings#minimumreleaseage
const PNPM_DEFAULT_MAJOR = 11
const DEFAULT_DAYS = 1

export interface PnpmInferred {
  // Whether `minimumReleaseAge` is explicitly declared (any number, incl. 0).
  // When true, this is terminal — it wins over yarn config and version
  // defaults, even when the value disables the maturity period.
  maturitySet: boolean
  // Resolved maturity period in days (only set when > 0 minutes).
  maturityPeriod?: number
  maturityPeriodExclude: string[]
  updateIgnores: string[]
}

// Reads maturity + "ignore on update" settings from the closest
// pnpm-workspace.yaml in a single parse.
//
// - `minimumReleaseAge` (minutes) / `minimumReleaseAgeExclude`
// - `update.ignoreDeps` (pnpm 11 & 12) and, before a rename,
//   `updateConfig.ignoreDependencies` (pnpm 10.x). Both are lists of package
//   name patterns (e.g. `load-json-file`, `@babel/*`) that should never be
//   updated. See https://pnpm.io/settings#updateignoredeps
export async function inferFromPnpm(cwd: string): Promise<PnpmInferred> {
  const filepath = findUp('pnpm-workspace.yaml', { cwd })
  const yaml = await readYamlTop(filepath)

  const maturityPeriodExclude = readStringList(yaml?.minimumReleaseAgeExclude)
  const updateIgnores = [...new Set([
    ...readStringList(yaml?.update?.ignoreDeps),
    ...readStringList(yaml?.updateConfig?.ignoreDependencies),
  ])]
  if (updateIgnores.length > 0)
    debug(`pnpm update ignores from ${filepath}: ${JSON.stringify(updateIgnores)}`)

  if (yaml && typeof yaml.minimumReleaseAge === 'number') {
    if (yaml.minimumReleaseAge > 0) {
      const days = yaml.minimumReleaseAge / 1440
      debug(`maturityPeriod=${days}d from ${filepath} (minimumReleaseAge=${yaml.minimumReleaseAge}m)`)
      return { maturitySet: true, maturityPeriod: days, maturityPeriodExclude, updateIgnores }
    }
    debug(`maturityPeriod disabled from ${filepath} (minimumReleaseAge=${yaml.minimumReleaseAge}m)`)
    return { maturitySet: true, maturityPeriodExclude, updateIgnores }
  }

  return { maturitySet: false, maturityPeriodExclude, updateIgnores }
}

// The default maturity period (days) implied by a pnpm `packageManager`
// version, or undefined when the version predates the default.
export function pnpmMaturityDefaultDays(version: string): number | undefined {
  const parts = parseSemverParts(version)
  if (parts && parts.major >= PNPM_DEFAULT_MAJOR)
    return DEFAULT_DAYS
  return undefined
}
