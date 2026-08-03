import { promises as fs } from 'node:fs'
import { up as findUp } from 'empathic/find'
import { createDebug } from 'obug'
import { parsePnpmWorkspaceYaml } from 'pnpm-workspace-yaml'

const debug = createDebug('taze:config')

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

// Reads the pnpm "ignore on update" lists from the closest pnpm-workspace.yaml.
// pnpm exposes this as `update.ignoreDeps` (v11 & 12) and, before a rename, as
// `updateConfig.ignoreDependencies` (v10.x). Both are lists of package name
// patterns (e.g. `load-json-file`, `@babel/*`) that should never be updated.
// See https://pnpm.io/settings#updateignoredeps
export async function detectPnpmUpdateIgnores(cwd: string): Promise<string[]> {
  const pnpmYamlPath = findUp('pnpm-workspace.yaml', { cwd })
  const pnpmYaml = await readYamlTop(pnpmYamlPath)
  if (!pnpmYaml)
    return []

  const ignores = [
    ...readStringList(pnpmYaml.update?.ignoreDeps),
    ...readStringList(pnpmYaml.updateConfig?.ignoreDependencies),
  ]
  const deduped = [...new Set(ignores)]
  if (deduped.length > 0)
    debug(`pnpm update ignores from ${pnpmYamlPath}: ${JSON.stringify(deduped)}`)
  return deduped
}
