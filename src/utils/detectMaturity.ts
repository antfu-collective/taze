import { promises as fs } from 'node:fs'
import { up as findUp } from 'empathic/find'
import { createDebug } from 'obug'
import { detect } from 'package-manager-detector'
import { parsePnpmWorkspaceYaml } from 'pnpm-workspace-yaml'

const debug = createDebug('taze:config')

// pnpm v11+ enables `minimumReleaseAge` by default at 1440 minutes (1 day).
// See https://pnpm.io/settings#minimumreleaseage
// Yarn 4.12+ enables `npmMinimalAgeGate` by default at "1d".
const PNPM_DEFAULT_MAJOR = 11
const YARN_DEFAULT_MAJOR = 4
const YARN_DEFAULT_MINOR = 12
const DEFAULT_DAYS = 1

export interface DetectedMaturityConfig {
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

async function readYamlTop(filepath: string | undefined): Promise<Record<string, any> | null> {
  if (!filepath)
    return null
  try {
    const text = await fs.readFile(filepath, 'utf-8')
    return parsePnpmWorkspaceYaml(text).getDocument().toJSON() as any
  }
  catch (e) {
    debug(`failed to parse ${filepath}: ${e}`)
    return null
  }
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value))
    return []

  return value.filter((item): item is string => typeof item === 'string')
}

function parseSemverParts(version: string | undefined): { major: number, minor: number } | null {
  if (!version)
    return null
  const [majStr, minStr] = version.split('+')[0].split('.')
  const major = Number.parseInt(majStr, 10)
  const minor = Number.parseInt(minStr, 10)
  if (!Number.isFinite(major))
    return null
  return { major, minor: Number.isFinite(minor) ? minor : 0 }
}

// Walk up to find the closest `packageManager` (or `devEngines.packageManager`)
// declaration. Reuses package-manager-detector for the walk + per-directory
// package.json lookup, capturing the raw version via its `packageJsonParser`
// hook. The library's own `DetectResult.version` collapses yarn >= 2 to
// "berry", so we snapshot the unprocessed value here.
async function detectAgentAndVersion(cwd: string): Promise<{ name: string, version: string } | null> {
  let matched: { name: string, version: string } | null = null
  await detect({
    cwd,
    strategies: ['packageManager-field', 'devEngines-field'],
    packageJsonParser(content) {
      const pkg = JSON.parse(content)
      if (!matched) {
        if (typeof pkg?.packageManager === 'string') {
          const at = pkg.packageManager.indexOf('@')
          if (at > 0) {
            matched = {
              name: pkg.packageManager.slice(0, at),
              version: pkg.packageManager.slice(at + 1),
            }
          }
        }
        else if (typeof pkg?.devEngines?.packageManager?.name === 'string') {
          matched = {
            name: pkg.devEngines.packageManager.name,
            version: pkg.devEngines.packageManager.version ?? '',
          }
        }
      }
      return pkg
    },
  })
  return matched
}

export async function detectMaturityConfig(cwd: string): Promise<DetectedMaturityConfig | undefined> {
  // 1. pnpm-workspace.yaml → minimumReleaseAge (minutes)
  const pnpmYamlPath = findUp('pnpm-workspace.yaml', { cwd })
  const pnpmYaml = await readYamlTop(pnpmYamlPath)
  const pnpmExclude = readStringList(pnpmYaml?.minimumReleaseAgeExclude)
  if (pnpmYaml && typeof pnpmYaml.minimumReleaseAge === 'number') {
    if (pnpmYaml.minimumReleaseAge > 0) {
      const days = pnpmYaml.minimumReleaseAge / 1440
      debug(`maturityPeriod=${days}d from ${pnpmYamlPath} (minimumReleaseAge=${pnpmYaml.minimumReleaseAge}m, minimumReleaseAgeExclude=${JSON.stringify(pnpmExclude)})`)
      return { maturityPeriod: days, maturityPeriodExclude: pnpmExclude }
    }

    debug(`maturityPeriod disabled from ${pnpmYamlPath} (minimumReleaseAge=${pnpmYaml.minimumReleaseAge}m, minimumReleaseAgeExclude=${JSON.stringify(pnpmExclude)})`)
    return { maturityPeriodExclude: pnpmExclude }
  }

  // 2. .yarnrc.yml → npmMinimalAgeGate (duration)
  const yarnYamlPath = findUp('.yarnrc.yml', { cwd })
  const yarnYaml = await readYamlTop(yarnYamlPath)
  const yarnExclude = readStringList(yarnYaml?.npmPreapprovedPackages)
  if (yarnYaml && yarnYaml.npmMinimalAgeGate != null) {
    const days = parseYarnDuration(yarnYaml.npmMinimalAgeGate)
    if (days != null) {
      debug(`maturityPeriod=${days}d from ${yarnYamlPath} (npmMinimalAgeGate=${JSON.stringify(yarnYaml.npmMinimalAgeGate)}, npmPreapprovedPackages=${JSON.stringify(yarnExclude)})`)
      return { maturityPeriod: days, maturityPeriodExclude: yarnExclude }
    }
  }

  // 3. packageManager defaults via package-manager-detector
  const agent = await detectAgentAndVersion(cwd)
  const parts = parseSemverParts(agent?.version)
  if (agent && parts) {
    if (agent.name === 'pnpm' && parts.major >= PNPM_DEFAULT_MAJOR) {
      debug(`maturityPeriod=${DEFAULT_DAYS}d from detected ${agent.name}@${agent.version}`)
      return { maturityPeriod: DEFAULT_DAYS, maturityPeriodExclude: pnpmExclude }
    }
    if (agent.name === 'yarn' && (parts.major > YARN_DEFAULT_MAJOR || (parts.major === YARN_DEFAULT_MAJOR && parts.minor >= YARN_DEFAULT_MINOR))) {
      debug(`maturityPeriod=${DEFAULT_DAYS}d from detected ${agent.name}@${agent.version}`)
      return { maturityPeriod: DEFAULT_DAYS, maturityPeriodExclude: yarnExclude }
    }
  }

  if (pnpmExclude.length > 0 || yarnExclude.length > 0)
    return { maturityPeriodExclude: [...pnpmExclude, ...yarnExclude] }

  return undefined
}

export async function detectMaturityPeriod(cwd: string): Promise<number | undefined> {
  return (await detectMaturityConfig(cwd))?.maturityPeriod
}
