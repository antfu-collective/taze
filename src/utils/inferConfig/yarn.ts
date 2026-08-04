import { up as findUp } from 'empathic/find'
import { debug, parseSemverParts, readStringList, readYamlTop } from './shared'

// Yarn 4.12+ enables `npmMinimalAgeGate` by default at "1d".
const YARN_DEFAULT_MAJOR = 4
const YARN_DEFAULT_MINOR = 12
const DEFAULT_DAYS = 1

export interface YarnInferred {
  // Whether a usable `npmMinimalAgeGate` is declared. Unlike pnpm, yarn has no
  // explicit-disable semantics: an unparseable/zero value simply falls through.
  maturitySet: boolean
  maturityPeriod?: number
  maturityPeriodExclude: string[]
}

// Parse a Yarn DURATION value. Yarn's SettingsType.DURATION with
// unit: MINUTES accepts either a bare number (minutes) or a string with
// an optional unit suffix (d/h/m/s). Returns days, or undefined.
export function parseYarnDuration(value: unknown): number | undefined {
  if (typeof value === 'number')
    return value > 0 ? value / 1440 : undefined
  if (typeof value !== 'string')
    return undefined
  const m = value.trim().match(/^(\d+(?:\.\d+)?)\s*([dhms]?)$/i)
  if (!m)
    return undefined
  const num = Number.parseFloat(m[1])
  if (!Number.isFinite(num) || num <= 0)
    return undefined
  switch ((m[2] || 'm').toLowerCase()) {
    case 'd': return num
    case 'h': return num / 24
    case 'm': return num / 1440
    case 's': return num / 86400
    default: return undefined
  }
}

// Reads maturity settings from the closest .yarnrc.yml:
// `npmMinimalAgeGate` (duration) / `npmPreapprovedPackages`.
export async function inferFromYarn(cwd: string): Promise<YarnInferred> {
  const filepath = findUp('.yarnrc.yml', { cwd })
  const yaml = await readYamlTop(filepath)

  const maturityPeriodExclude = readStringList(yaml?.npmPreapprovedPackages)

  if (yaml && yaml.npmMinimalAgeGate != null) {
    const days = parseYarnDuration(yaml.npmMinimalAgeGate)
    if (days != null) {
      debug(`maturityPeriod=${days}d from ${filepath} (npmMinimalAgeGate=${JSON.stringify(yaml.npmMinimalAgeGate)})`)
      return { maturitySet: true, maturityPeriod: days, maturityPeriodExclude }
    }
  }

  return { maturitySet: false, maturityPeriodExclude }
}

// The default maturity period (days) implied by a yarn `packageManager`
// version, or undefined when the version predates the default.
export function yarnMaturityDefaultDays(version: string): number | undefined {
  const parts = parseSemverParts(version)
  if (parts && (parts.major > YARN_DEFAULT_MAJOR || (parts.major === YARN_DEFAULT_MAJOR && parts.minor >= YARN_DEFAULT_MINOR)))
    return DEFAULT_DAYS
  return undefined
}
