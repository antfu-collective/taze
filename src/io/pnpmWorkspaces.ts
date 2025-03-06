import type { PnpmWorkspaceYaml } from 'pnpm-catalogs-utils'
import type { CommonOptions, PnpmWorkspaceMeta, RawDep } from '../types'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'pathe'
import { parsePnpmWorkspaceYaml } from 'pnpm-catalogs-utils'
import { dumpDependencies, parseDependency } from './dependencies'

export async function loadPnpmWorkspace(
  relative: string,
  options: CommonOptions,
  shouldUpdate: (name: string) => boolean,
): Promise<PnpmWorkspaceMeta[]> {
  const filepath = resolve(options.cwd ?? '', relative)
  const rawText = await readFile(filepath, 'utf-8')
  const context = parsePnpmWorkspaceYaml(rawText)
  const raw = context.document.toJSON()

  const catalogs: PnpmWorkspaceMeta[] = []

  function createCatalogFromKeyValue(catalogName: string, map: Record<string, string>): PnpmWorkspaceMeta {
    const deps: RawDep[] = Object.entries(map)
      .map(([name, version]) => parseDependency(name, version, 'pnpm:catalog', shouldUpdate))

    return {
      name: `catalog:${catalogName}`,
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

  if (raw.catalog) {
    catalogs.push(
      createCatalogFromKeyValue('default', raw.catalog),
    )
  }

  if (raw.catalogs) {
    for (const key of Object.keys(raw.catalogs)) {
      catalogs.push(
        createCatalogFromKeyValue(key, raw.catalogs[key]),
      )
    }
  }

  return catalogs
}

export async function writePnpmWorkspace(
  pkg: PnpmWorkspaceMeta,
  _options: CommonOptions,
) {
  const versions = dumpDependencies(pkg.resolved, 'pnpm:catalog')

  if (!Object.keys(versions).length)
    return

  const catalogName = pkg.name.replace('catalog:', '')

  for (const [key, targetVersion] of Object.entries(versions)) {
    pkg.context.setPackage(catalogName, key, targetVersion)
  }

  if (pkg.context.hasChanged()) {
    await writeYaml(pkg, pkg.context)
  }
}

export function writeYaml(pkg: PnpmWorkspaceMeta, document: PnpmWorkspaceYaml) {
  return writeFile(pkg.filepath, document.toString(), 'utf8')
}
