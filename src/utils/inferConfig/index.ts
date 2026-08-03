import { inferFromPnpm, pnpmMaturityDefaultDays } from './pnpm'
import { detectAgentAndVersion } from './shared'
import { inferFromYarn, yarnMaturityDefaultDays } from './yarn'

export interface InferredConfig {
  // Maturity period in days, or undefined when nothing implies one.
  maturityPeriod?: number
  maturityPeriodExclude: string[]
  updateIgnores: string[]
}

// Infers taze settings from the surrounding package-manager config, combining
// every source in one pass. Maturity resolution follows a fixed priority:
//   1. pnpm-workspace.yaml `minimumReleaseAge` (explicit, incl. disabled)
//   2. .yarnrc.yml `npmMinimalAgeGate`
//   3. `packageManager` / `devEngines` version defaults (pnpm@11, yarn@4.12)
//   4. otherwise none, keeping every discovered exclude list
// `updateIgnores` is pnpm-only and always sourced from pnpm-workspace.yaml.
export async function inferConfig(cwd: string): Promise<InferredConfig> {
  const pnpm = await inferFromPnpm(cwd)
  const updateIgnores = pnpm.updateIgnores

  // 1. pnpm-workspace.yaml explicit value wins (even when it disables maturity).
  if (pnpm.maturitySet) {
    return { maturityPeriod: pnpm.maturityPeriod, maturityPeriodExclude: pnpm.maturityPeriodExclude, updateIgnores }
  }

  // 2. .yarnrc.yml explicit value.
  const yarn = await inferFromYarn(cwd)
  if (yarn.maturitySet) {
    return { maturityPeriod: yarn.maturityPeriod, maturityPeriodExclude: yarn.maturityPeriodExclude, updateIgnores }
  }

  // 3. packageManager / devEngines version defaults.
  const agent = await detectAgentAndVersion(cwd)
  if (agent) {
    if (agent.name === 'pnpm') {
      const days = pnpmMaturityDefaultDays(agent.version)
      if (days != null)
        return { maturityPeriod: days, maturityPeriodExclude: pnpm.maturityPeriodExclude, updateIgnores }
    }
    if (agent.name === 'yarn') {
      const days = yarnMaturityDefaultDays(agent.version)
      if (days != null)
        return { maturityPeriod: days, maturityPeriodExclude: yarn.maturityPeriodExclude, updateIgnores }
    }
  }

  // 4. No maturity period, but keep any discovered exclude patterns.
  return {
    maturityPeriodExclude: [...pnpm.maturityPeriodExclude, ...yarn.maturityPeriodExclude],
    updateIgnores,
  }
}
