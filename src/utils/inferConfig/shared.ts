import { promises as fs } from 'node:fs'
import { createDebug } from 'obug'
import { detect } from 'package-manager-detector'
import { parsePnpmWorkspaceYaml } from 'pnpm-workspace-yaml'

export const debug = createDebug('taze:config')

// Both pnpm-workspace.yaml and .yarnrc.yml are YAML documents; the
// pnpm-workspace-yaml parser round-trips either into a plain object so we can
// read arbitrary top-level keys.
export async function readYamlTop(filepath: string | undefined): Promise<Record<string, any> | null> {
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

export function readStringList(value: unknown): string[] {
  if (!Array.isArray(value))
    return []

  return value.filter((item): item is string => typeof item === 'string')
}

export function parseSemverParts(version: string | undefined): { major: number, minor: number } | null {
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
export async function detectAgentAndVersion(cwd: string): Promise<{ name: string, version: string } | null> {
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
