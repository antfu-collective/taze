import type { PnpmWorkspaceYaml } from 'pnpm-workspace-yaml'
import type { CommonOptions, PnpmWorkspaceMeta, RawDep } from '../types'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'pathe'
import { parsePnpmWorkspaceYaml } from 'pnpm-workspace-yaml'
import { dumpDependencies, parseDependency } from './dependencies'

export async function loadPnpmWorkspace(
  relative: string,
  options: CommonOptions,
  shouldUpdate: (name: string) => boolean,
): Promise<PnpmWorkspaceMeta[]> {
  const filepath = resolve(options.cwd ?? '', relative)
  const rawText = await readFile(filepath, 'utf-8')
  const context = parsePnpmWorkspaceYaml(rawText)
  const raw = context.getDocument().toJSON()

  const catalogs: PnpmWorkspaceMeta[] = []

  function createPnpmWorkspaceEntry(name: string, map: Record<string, string>): PnpmWorkspaceMeta {
    const deps: RawDep[] = Object.entries(map)
      .map(([pkg, version]) => parseDependency({ name: pkg, version, type: 'pnpm-workspace', shouldUpdate }))

    return {
      name,
      private: true,
      version: '',
      type: 'pnpm-workspace.yaml',
      relative,
      filepath,
      raw,
      context,
      deps,
      resolved: [],
    } satisfies PnpmWorkspaceMeta
  }

  if (raw?.catalog) {
    catalogs.push(
      createPnpmWorkspaceEntry('pnpm-catalog:default', raw.catalog),
    )
  }

  if (raw?.catalogs) {
    for (const key of Object.keys(raw.catalogs)) {
      catalogs.push(
        createPnpmWorkspaceEntry(`pnpm-catalog:${key}`, raw.catalogs[key]),
      )
    }
  }

  if (raw?.overrides) {
    catalogs.push(
      createPnpmWorkspaceEntry('pnpm-workspace:overrides', raw.overrides),
    )
  }

  return catalogs
}

export async function writePnpmWorkspace(
  pkg: PnpmWorkspaceMeta,
  _options: CommonOptions,
) {
  const versions = dumpDependencies(pkg.resolved, 'pnpm-workspace')

  if (!Object.keys(versions).length)
    return

  if (pkg.name.startsWith('pnpm-catalog:')) {
    const catalogName = pkg.name.replace('pnpm-catalog:', '')
    for (const [key, targetVersion] of Object.entries(versions)) {
      pkg.context.setPackage(catalogName, key, targetVersion)
    }
  }
  else {
    const paths = pkg.name.replace('pnpm-workspace:', '').split(/\./g)
    for (const [key, targetVersion] of Object.entries(versions)) {
      pkg.context.setPath([...paths, key], targetVersion)
    }
  }

  if (pkg.context.hasChanged()) {
    await writeYaml(pkg, pkg.context)
  }
}

export function writeYaml(pkg: PnpmWorkspaceMeta, document: PnpmWorkspaceYaml) {
  return writeFile(pkg.filepath, document.toString(), 'utf8')
}
